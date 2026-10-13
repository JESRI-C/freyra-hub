import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import {
  loadSavedOfficialWatercourseReach,
  type SavedOfficialWatercourseReach,
} from "@/lib/watercourse-reach.functions";
import {
  fetchOfficialWatercourse,
  type OfficialWatercourseGeometry,
} from "@/services/geospatial/official-watercourse-source";
import {
  baselineSha256,
  baselineSnapshotFromRow,
  baselineSummaryFromRow,
  buildPublicBaselineManifest,
  validatePublicBaselineManifest,
  type BaselineProjectRow,
} from "@/services/baseline/public-baseline-service";
import type {
  CreatePublicBaselineInput,
  PublicBaselineManifest,
  PublicBaselineSnapshot,
  PublicBaselineSummary,
} from "@/services/baseline/public-baseline-types";
import { collectPublicBaselineSources } from "@/services/baseline/collect-public-baseline.server";

const Uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "Ugyldigt ID");
const DateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Ugyldig dato");
const ProjectInput = z.object({ projectId: Uuid }).strict();
const SnapshotInput = ProjectInput.extend({ snapshotId: Uuid }).strict();
const CreateInput = ProjectInput.extend({ dateFrom: DateText, dateTo: DateText, requestId: Uuid })
  .strict()
  .refine(
    (input) => input.dateFrom <= input.dateTo,
    "Fra-dato skal ligge før eller på til-datoen.",
  );

interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
}
interface BaselineQuery extends PromiseLike<QueryResult> {
  select(columns: string): BaselineQuery;
  eq(column: string, value: unknown): BaselineQuery;
  order(column: string, options: { ascending: boolean }): BaselineQuery;
  limit(count: number): BaselineQuery;
  maybeSingle(): Promise<QueryResult>;
}
export interface PublicBaselineClient {
  from(table: string): BaselineQuery;
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<QueryResult>;
}

export interface PublicBaselineDependencies {
  authorizeProject(
    client: ProjectAuthorizationClient,
    userId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadProject(client: PublicBaselineClient, projectId: string): Promise<BaselineProjectRow>;
  loadReference(
    client: PublicBaselineClient,
    projectId: string,
  ): Promise<SavedOfficialWatercourseReach | null>;
  fetchReference(id: string): Promise<OfficialWatercourseGeometry>;
  collectSources(manifest: PublicBaselineManifest): Promise<PublicBaselineManifest>;
  loadRequest(
    client: PublicBaselineClient,
    projectId: string,
    actorId: string,
    requestId: string,
  ): Promise<PublicBaselineSnapshot | null>;
  loadSnapshot(
    client: PublicBaselineClient,
    projectId: string,
    snapshotId: string,
  ): Promise<PublicBaselineSnapshot | null>;
  listSnapshots(client: PublicBaselineClient, projectId: string): Promise<PublicBaselineSummary[]>;
  getWriter(): Promise<PublicBaselineClient>;
  persist(
    writer: PublicBaselineClient,
    input: CreatePublicBaselineInput,
    actorId: string,
    manifest: PublicBaselineManifest,
  ): Promise<PublicBaselineSnapshot>;
  now(): string;
}

async function readOne(
  client: PublicBaselineClient,
  projectId: string,
  column: string,
  id: string,
  actorId?: string,
): Promise<PublicBaselineSnapshot | null> {
  let query = client
    .from("project_baseline_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .eq(column, id);
  if (actorId) query = query.eq("created_by", actorId);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error(
      "Kunne ikke læse gemt datagrundlag. Baseline-migration og adgang skal være på plads.",
    );
  if (!data) return null;
  const snapshot = await baselineSnapshotFromRow(data);
  if (snapshot.projectId !== projectId)
    throw new Error("Den gemte version tilhører ikke denne sag.");
  if (
    (column === "id" && snapshot.id !== id) ||
    (column === "request_id" && (snapshot.requestId !== id || snapshot.createdBy !== actorId))
  ) {
    throw new Error("Den gemte version matcher ikke den ønskede reference.");
  }
  return snapshot;
}

const DEFAULT_DEPENDENCIES: PublicBaselineDependencies = {
  authorizeProject: requireProjectNatureAccess,
  loadProject: async (client, projectId) => {
    const { data, error } = await client
      .from("projects")
      .select("id,name,geometry_polygon")
      .eq("id", projectId)
      .maybeSingle();
    if (error || !data) throw new Error("Kunne ikke læse projektets gemte geometri.");
    return z.object({ id: Uuid, name: z.string(), geometry_polygon: z.unknown() }).parse(data);
  },
  loadReference: (client, projectId) =>
    loadSavedOfficialWatercourseReach(client as never, projectId),
  fetchReference: fetchOfficialWatercourse,
  collectSources: collectPublicBaselineSources,
  loadRequest: (client, projectId, actorId, requestId) =>
    readOne(client, projectId, "request_id", requestId, actorId),
  loadSnapshot: (client, projectId, snapshotId) => readOne(client, projectId, "id", snapshotId),
  listSnapshots: async (client, projectId) => {
    const { data, error } = await client
      .from("project_baseline_snapshots")
      .select("id,project_id,version_no,created_at,created_by,request_id,manifest_sha256")
      .eq("project_id", projectId)
      .order("version_no", { ascending: false })
      .limit(30);
    if (error)
      throw new Error(
        "Kunne ikke læse baselineversioner. Baseline-migration og adgang skal være på plads.",
      );
    if (!Array.isArray(data)) throw new Error("Databasen returnerede ugyldige baselineversioner.");
    // The first meeting version shows the latest 30; older-version pagination is a follow-up.
    const summaries = data.map(baselineSummaryFromRow);
    if (summaries.some((row) => row.projectId !== projectId))
      throw new Error("Baselineversionerne matcher ikke denne sag.");
    return summaries;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as PublicBaselineClient;
  },
  persist: async (writer, input, actorId, manifest) => {
    const { data, error } = await writer.rpc("persist_project_baseline", {
      p_project_id: input.projectId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_manifest: manifest,
      p_manifest_sha256: await baselineSha256(manifest),
    });
    if (error || !data)
      throw new Error(
        "Datagrundlaget blev ikke gemt. Baseline-migration, serveradgang og projektrettighed skal være på plads.",
      );
    const snapshot = await baselineSnapshotFromRow(Array.isArray(data) ? data[0] : data);
    if (
      snapshot.projectId !== input.projectId ||
      snapshot.createdBy !== actorId ||
      snapshot.requestId !== input.requestId ||
      snapshot.manifest.period.from !== input.dateFrom ||
      snapshot.manifest.period.to !== input.dateTo
    ) {
      throw new Error("Databasen bekræftede ikke den ønskede baselineversion.");
    }
    return snapshot;
  },
  now: () => new Date().toISOString(),
};

export async function executeCreateProjectBaseline(
  raw: CreatePublicBaselineInput,
  userId: string,
  client: PublicBaselineClient,
  overrides: Partial<PublicBaselineDependencies> = {},
): Promise<PublicBaselineSnapshot> {
  const input = CreateInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  if (!access.canPersist)
    throw new Error("Du har ikke rettighed til at gemme projektets datagrundlag.");
  const existing = await dependencies.loadRequest(client, input.projectId, userId, input.requestId);
  if (existing) {
    if (
      existing.manifest.period.from !== input.dateFrom ||
      existing.manifest.period.to !== input.dateTo
    ) {
      throw new Error("Denne anmodning er allerede brugt til en anden datoperiode.");
    }
    return existing;
  }
  const project = await dependencies.loadProject(client, input.projectId);
  const reference = await dependencies.loadReference(client, input.projectId);
  if (!reference)
    throw new Error("Vælg og gem en officiel vandløbsreference, før du henter datagrundlaget.");
  const official = await dependencies.fetchReference(reference.id);
  const fetchedReference = {
    ...official,
    zoneId: reference.zoneId,
    savedAt: reference.savedAt,
    municipalities: reference.municipalities.length
      ? reference.municipalities
      : official.municipalities,
  };
  const initialManifest = await buildPublicBaselineManifest(
    input,
    project,
    reference,
    fetchedReference,
    dependencies.now(),
  );
  const manifest = await dependencies.collectSources(initialManifest);
  await validatePublicBaselineManifest(manifest);
  // Import the privileged writer only after caller-bound authorization and canonical input validation.
  const writer = await dependencies.getWriter();
  return dependencies.persist(writer, input, userId, manifest);
}

export async function executeGetProjectBaseline(
  raw: { projectId: string; snapshotId: string },
  userId: string,
  client: PublicBaselineClient,
  overrides: Partial<PublicBaselineDependencies> = {},
): Promise<PublicBaselineSnapshot | null> {
  const input = SnapshotInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  return dependencies.loadSnapshot(client, input.projectId, input.snapshotId);
}

export async function executeListProjectBaselines(
  raw: { projectId: string },
  userId: string,
  client: PublicBaselineClient,
  overrides: Partial<PublicBaselineDependencies> = {},
): Promise<PublicBaselineSummary[]> {
  const input = ProjectInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  return dependencies.listSnapshots(client, input.projectId);
}

export const createProjectBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => CreateInput.parse(raw))
  .handler(({ data, context }) =>
    executeCreateProjectBaseline(
      data,
      context.userId,
      context.supabase as unknown as PublicBaselineClient,
    ),
  );
export const getProjectBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SnapshotInput.parse(raw))
  .handler(({ data, context }) =>
    executeGetProjectBaseline(
      data,
      context.userId,
      context.supabase as unknown as PublicBaselineClient,
    ),
  );
export const listProjectBaselines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ProjectInput.parse(raw))
  .handler(({ data, context }) =>
    executeListProjectBaselines(
      data,
      context.userId,
      context.supabase as unknown as PublicBaselineClient,
    ),
  );
