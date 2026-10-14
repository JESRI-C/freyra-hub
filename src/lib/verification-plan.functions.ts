import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireProjectNatureAccess,
  type ProjectAuthorizationClient,
  type ProjectNatureAccess,
} from "@/lib/project-nature-access.server";
import { baselineSnapshotFromRow } from "@/services/baseline/public-baseline-service";
import {
  createVerifiedInputContext,
  type VerifiedInputContext,
} from "@/services/baseline/verified-input-context";
import type { PublicBaselineSnapshot } from "@/services/baseline/public-baseline-types";
import {
  buildVerificationPlanManifest,
  validateVerificationBaseline,
  verificationPlanCanonicalText,
  verificationPlanSummaryFromRow,
  verificationPlanVersionFromRow,
  type ListVerificationPlansInput,
  type SaveVerificationPlanInput,
  type VerificationPlanManifest,
  type VerificationPlanPage,
  type VerificationPlanVersion,
} from "@/services/baseline/verification-plan-persistence";

const Uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const ProjectInput = z.object({ projectId: Uuid }).strict();
const SaveInput = ProjectInput.extend({ baselineId: Uuid, requestId: Uuid }).strict();
const GetInput = ProjectInput.extend({ planId: Uuid }).strict();
const ListInput = ProjectInput.extend({
  baselineId: Uuid.optional(),
  beforeVersion: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(30).default(30),
}).strict();

interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
}
interface PlanQuery extends PromiseLike<QueryResult> {
  select(columns: string): PlanQuery;
  eq(column: string, value: unknown): PlanQuery;
  lt(column: string, value: unknown): PlanQuery;
  order(column: string, options: { ascending: boolean }): PlanQuery;
  limit(count: number): PlanQuery;
  maybeSingle(): Promise<QueryResult>;
}
export interface VerificationPlanClient {
  from(table: string): PlanQuery;
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<QueryResult>;
}
export interface VerificationPlanDependencies {
  authorizeProject(
    client: ProjectAuthorizationClient,
    userId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadBaseline(
    client: VerificationPlanClient,
    projectId: string,
    baselineId: string,
    context?: VerifiedInputContext,
  ): Promise<PublicBaselineSnapshot | null>;
  loadRequest(
    client: VerificationPlanClient,
    projectId: string,
    actorId: string,
    requestId: string,
  ): Promise<unknown | null>;
  loadPlan(
    client: VerificationPlanClient,
    projectId: string,
    planId: string,
  ): Promise<unknown | null>;
  listPlans(client: VerificationPlanClient, input: z.infer<typeof ListInput>): Promise<unknown[]>;
  getWriter(): Promise<VerificationPlanClient>;
  persist(
    writer: VerificationPlanClient,
    input: SaveVerificationPlanInput,
    actorId: string,
    manifest: VerificationPlanManifest,
  ): Promise<unknown>;
}

async function readPlan(
  client: VerificationPlanClient,
  projectId: string,
  column: string,
  id: string,
  actorId?: string,
): Promise<unknown | null> {
  let query = client
    .from("verification_plan_versions")
    .select("*")
    .eq("project_id", projectId)
    .eq(column, id);
  if (actorId) query = query.eq("created_by", actorId);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error("Kunne ikke læse gemte verifikationsplaner. Kontrollér migration og adgang.");
  return data;
}

const DEFAULT_DEPENDENCIES: VerificationPlanDependencies = {
  authorizeProject: requireProjectNatureAccess,
  loadBaseline: async (client, projectId, baselineId, context) => {
    const { data, error } = await client
      .from("project_baseline_snapshots")
      .select("*")
      .eq("project_id", projectId)
      .eq("id", baselineId)
      .maybeSingle();
    if (error) throw new Error("Kunne ikke læse planens gemte datagrundlag.");
    return data ? baselineSnapshotFromRow(data, context) : null;
  },
  loadRequest: (client, projectId, actorId, requestId) =>
    readPlan(client, projectId, "request_id", requestId, actorId),
  loadPlan: (client, projectId, planId) => readPlan(client, projectId, "id", planId),
  listPlans: async (client, input) => {
    let query = client
      .from("verification_plan_versions")
      .select(
        "id,project_id,version_no,baseline_id,baseline_sha256,generator_version,manifest_sha256,created_at,created_by,request_id",
      )
      .eq("project_id", input.projectId);
    if (input.baselineId) query = query.eq("baseline_id", input.baselineId);
    if (input.beforeVersion) query = query.lt("version_no", input.beforeVersion);
    const { data, error } = await query
      .order("version_no", { ascending: false })
      .limit(input.limit + 1);
    if (error || !Array.isArray(data))
      throw new Error("Kunne ikke læse planversioner. Kontrollér migration og adgang.");
    return data;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as VerificationPlanClient;
  },
  persist: async (writer, input, actorId, manifest) => {
    const { data, error } = await writer.rpc("persist_verification_plan", {
      p_project_id: input.projectId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_baseline_id: input.baselineId,
      p_baseline_sha256: manifest.snapshotSha256,
      // The database hashes these exact canonical UTF-8 bytes itself.
      p_manifest_text: verificationPlanCanonicalText(manifest),
    });
    if (error || !data)
      throw new Error(
        "Verifikationsplanen blev ikke gemt. Kontrollér migration, serveradgang og projektrettighed.",
      );
    return Array.isArray(data) ? data[0] : data;
  },
};

async function loadRequiredBaseline(
  dependencies: VerificationPlanDependencies,
  client: VerificationPlanClient,
  projectId: string,
  baselineId: string,
  context?: VerifiedInputContext,
): Promise<PublicBaselineSnapshot> {
  const loadedBaseline = context
    ? await dependencies.loadBaseline(client, projectId, baselineId, context)
    : await dependencies.loadBaseline(client, projectId, baselineId);
  if (!loadedBaseline)
    throw new Error("Vælg en gemt baselineversion i denne sag, før du gemmer planen.");
  const baseline = context
    ? await context.verifyBaseline(loadedBaseline, projectId, baselineId)
    : loadedBaseline;
  await validateVerificationBaseline(baseline, projectId, baselineId, context);
  return baseline;
}

export async function executeSaveVerificationPlan(
  raw: SaveVerificationPlanInput,
  userId: string,
  client: VerificationPlanClient,
  overrides: Partial<VerificationPlanDependencies> = {},
): Promise<VerificationPlanVersion> {
  const input = SaveInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  if (!access.canPersist)
    throw new Error("Du har ikke rettighed til at gemme verifikationsplanen.");
  const existing = await dependencies.loadRequest(client, input.projectId, userId, input.requestId);
  if (existing) {
    const summary = verificationPlanSummaryFromRow(existing);
    if (
      summary.projectId !== input.projectId ||
      summary.createdBy !== userId ||
      summary.requestId !== input.requestId ||
      summary.baselineId !== input.baselineId
    )
      throw new Error("Denne anmodning er allerede brugt til en anden plan eller baseline.");
    const baseline = await loadRequiredBaseline(
      dependencies,
      client,
      input.projectId,
      input.baselineId,
    );
    return verificationPlanVersionFromRow(existing, baseline);
  }
  const baseline = await loadRequiredBaseline(
    dependencies,
    client,
    input.projectId,
    input.baselineId,
  );
  const manifest = await buildVerificationPlanManifest(baseline);
  const writer = await dependencies.getWriter();
  const persisted = await dependencies.persist(writer, input, userId, manifest);
  const plan = await verificationPlanVersionFromRow(persisted, baseline);
  if (
    plan.projectId !== input.projectId ||
    plan.baselineId !== input.baselineId ||
    plan.createdBy !== userId ||
    plan.requestId !== input.requestId
  )
    throw new Error("Databasen bekræftede ikke den ønskede planversion.");
  return plan;
}

export async function executeGetVerificationPlan(
  raw: { projectId: string; planId: string },
  userId: string,
  client: VerificationPlanClient,
  overrides: Partial<VerificationPlanDependencies> = {},
): Promise<VerificationPlanVersion | null> {
  const input = GetInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  const row = await dependencies.loadPlan(client, input.projectId, input.planId);
  if (!row) return null;
  const summary = verificationPlanSummaryFromRow(row);
  if (summary.projectId !== input.projectId || summary.id !== input.planId)
    throw new Error("Den gemte plan matcher ikke denne sag eller version.");
  // Keep verified immutable inputs local to this current-authorized read.
  const context = createVerifiedInputContext();
  const baseline = await loadRequiredBaseline(
    dependencies,
    client,
    input.projectId,
    summary.baselineId,
    context,
  );
  return verificationPlanVersionFromRow(row, baseline, context);
}

export async function executeListVerificationPlans(
  raw: ListVerificationPlansInput,
  userId: string,
  client: VerificationPlanClient,
  overrides: Partial<VerificationPlanDependencies> = {},
): Promise<VerificationPlanPage> {
  const input = ListInput.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  const rows = await dependencies.listPlans(client, input);
  if (rows.length > input.limit + 1)
    throw new Error("Databasen returnerede for mange planversioner.");
  const summaries = rows.map(verificationPlanSummaryFromRow);
  if (
    summaries.some(
      (row, index) =>
        row.projectId !== input.projectId ||
        (input.baselineId && row.baselineId !== input.baselineId) ||
        (input.beforeVersion && row.version >= input.beforeVersion) ||
        (index > 0 && summaries[index - 1].version <= row.version),
    )
  )
    throw new Error("Planversionerne matcher ikke sagen, baselinen eller sidens rækkefølge.");
  const items = summaries.slice(0, input.limit);
  return {
    items,
    nextBeforeVersion: summaries.length > input.limit ? items.at(-1)!.version : null,
  };
}

export const saveVerificationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveInput.parse(raw))
  .handler(({ data, context }) =>
    executeSaveVerificationPlan(
      data,
      context.userId,
      context.supabase as unknown as VerificationPlanClient,
    ),
  );
export const getVerificationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetInput.parse(raw))
  .handler(({ data, context }) =>
    executeGetVerificationPlan(
      data,
      context.userId,
      context.supabase as unknown as VerificationPlanClient,
    ),
  );
export const listVerificationPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListInput.parse(raw))
  .handler(({ data, context }) =>
    executeListVerificationPlans(
      data,
      context.userId,
      context.supabase as unknown as VerificationPlanClient,
    ),
  );
