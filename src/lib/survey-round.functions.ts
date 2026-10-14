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
  validateVerificationBaseline,
  verificationPlanSummaryFromRow,
  verificationPlanVersionFromRow,
  type VerificationPlanVersion,
} from "@/services/baseline/verification-plan-persistence";
import {
  buildSurveyRoundManifestV1,
  GetSurveyRoundInputSchema,
  ListSurveyRoundsInputSchema,
  SaveSurveyRoundInputSchema,
  surveyRoundCanonicalText,
  surveyRoundSummaryFromRow,
  surveyRoundVersionFromRow,
  type ListSurveyRoundsInput,
  type SaveSurveyRoundInput,
  type SurveyRoundManifest,
  type SurveyRoundPage,
  type SurveyRoundVersion,
} from "@/services/baseline/survey-round-persistence";

interface QueryResult {
  data: unknown;
  error: { message?: string } | null;
}

/** Compare-only transport hint, excluded from canonical domain input and manifest. */
export const SaveSurveyRoundEnvelopeSchema = SaveSurveyRoundInputSchema.extend({
  expectedCallerUserId: SaveSurveyRoundInputSchema.shape.projectId,
}).strict();
export type SaveSurveyRoundEnvelope = z.infer<typeof SaveSurveyRoundEnvelopeSchema>;
interface RoundQuery extends PromiseLike<QueryResult> {
  select(columns: string): RoundQuery;
  eq(column: string, value: unknown): RoundQuery;
  lt(column: string, value: unknown): RoundQuery;
  order(column: string, options: { ascending: boolean }): RoundQuery;
  limit(count: number): RoundQuery;
  maybeSingle(): Promise<QueryResult>;
}
export interface SurveyRoundClient {
  from(table: string): RoundQuery;
  rpc(name: string, parameters: Record<string, unknown>): PromiseLike<QueryResult>;
}
export interface SurveyRoundDependencies {
  authorizeProject(
    client: ProjectAuthorizationClient,
    userId: string,
    projectId: string,
  ): Promise<ProjectNatureAccess>;
  loadBaseline(
    client: SurveyRoundClient,
    projectId: string,
    baselineId: string,
    context?: VerifiedInputContext,
  ): Promise<PublicBaselineSnapshot | null>;
  loadPlan(client: SurveyRoundClient, projectId: string, planId: string): Promise<unknown | null>;
  loadRequest(
    client: SurveyRoundClient,
    projectId: string,
    actorId: string,
    requestId: string,
  ): Promise<unknown | null>;
  loadRound(
    client: SurveyRoundClient,
    projectId: string,
    roundVersionId: string,
  ): Promise<unknown | null>;
  listRounds(
    client: SurveyRoundClient,
    input: z.infer<typeof ListSurveyRoundsInputSchema>,
  ): Promise<unknown[]>;
  getWriter(): Promise<SurveyRoundClient>;
  persist(
    writer: SurveyRoundClient,
    input: SaveSurveyRoundInput,
    actorId: string,
    manifest: SurveyRoundManifest,
  ): Promise<unknown>;
}

async function readOne(
  client: SurveyRoundClient,
  table: string,
  projectId: string,
  column: string,
  id: string,
  actorId?: string,
): Promise<unknown | null> {
  let query = client.from(table).select("*").eq("project_id", projectId).eq(column, id);
  if (actorId) query = query.eq("created_by", actorId);
  const { data, error } = await query.maybeSingle();
  if (error)
    throw new Error(
      "Kunne ikke læse registreringsrundens gemte input. Kontrollér migration og adgang.",
    );
  return data;
}

const DEFAULT_DEPENDENCIES: SurveyRoundDependencies = {
  authorizeProject: requireProjectNatureAccess,
  loadBaseline: async (client, projectId, baselineId, context) => {
    const row = await readOne(client, "project_baseline_snapshots", projectId, "id", baselineId);
    return row ? baselineSnapshotFromRow(row, context) : null;
  },
  loadPlan: (client, projectId, planId) =>
    readOne(client, "verification_plan_versions", projectId, "id", planId),
  loadRequest: (client, projectId, actorId, requestId) =>
    readOne(client, "survey_round_versions", projectId, "request_id", requestId, actorId),
  loadRound: (client, projectId, roundVersionId) =>
    readOne(client, "survey_round_versions", projectId, "id", roundVersionId),
  listRounds: async (client, input) => {
    let query = client
      .from("survey_round_versions")
      .select(
        "id,round_id,round_version_no,supersedes_id,project_id,version_no,baseline_id,baseline_sha256,plan_id,plan_sha256,builder_version,status,kind,title,recording_date_from,recording_date_to,manifest_sha256,created_at,created_by,request_id",
      )
      .eq("project_id", input.projectId);
    if (input.roundId) query = query.eq("round_id", input.roundId);
    if (input.baselineId) query = query.eq("baseline_id", input.baselineId);
    if (input.planId) query = query.eq("plan_id", input.planId);
    if (input.beforeVersion) query = query.lt("version_no", input.beforeVersion);
    const { data, error } = await query
      .order("version_no", { ascending: false })
      .limit(input.limit + 1);
    if (error || !Array.isArray(data))
      throw new Error(
        "Kunne ikke læse registreringsrundernes versioner. Kontrollér migration og adgang.",
      );
    return data;
  },
  getWriter: async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as unknown as SurveyRoundClient;
  },
  persist: async (writer, input, actorId, manifest) => {
    const { data, error } = await writer.rpc("persist_survey_round", {
      p_project_id: input.projectId,
      p_actor_id: actorId,
      p_request_id: input.requestId,
      p_baseline_id: input.baselineId,
      p_baseline_sha256: input.baselineSha256,
      p_plan_id: input.planId,
      p_plan_sha256: input.planSha256,
      // Database computes SHA256 over the exact canonical UTF-8 bytes.
      p_manifest_text: surveyRoundCanonicalText(manifest),
    });
    if (error || !data)
      throw new Error(
        "Registreringsrunden blev ikke gemt. Kontrollér serveradgang, migration og projektrettighed.",
      );
    return Array.isArray(data) ? data[0] : data;
  },
};

export async function executeGetSurveyRoundAccess(
  raw: { projectId: string },
  userId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundDependencies> = {},
): Promise<{ projectId: string; userId: string; canPersist: boolean }> {
  // Reuse the strict project-only get shape without accepting any actor input.
  const input = GetSurveyRoundInputSchema.omit({ roundVersionId: true }).parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  return { projectId: input.projectId, userId, canPersist: access.canPersist };
}

async function loadRequiredInputs(
  dependencies: SurveyRoundDependencies,
  client: SurveyRoundClient,
  projectId: string,
  baselineId: string,
  planId: string,
  context?: VerifiedInputContext,
): Promise<{ baseline: PublicBaselineSnapshot; planRow: unknown; plan: VerificationPlanVersion }> {
  const [loadedBaseline, planRow] = await Promise.all([
    context
      ? dependencies.loadBaseline(client, projectId, baselineId, context)
      : dependencies.loadBaseline(client, projectId, baselineId),
    dependencies.loadPlan(client, projectId, planId),
  ]);
  if (!loadedBaseline || !planRow)
    throw new Error("Vælg en gemt baseline og plan i denne sag, før du opretter runden.");
  const baseline = context
    ? await context.verifyBaseline(loadedBaseline, projectId, baselineId)
    : loadedBaseline;
  await validateVerificationBaseline(baseline, projectId, baselineId, context);
  const summary = verificationPlanSummaryFromRow(planRow);
  if (summary.id !== planId || summary.projectId !== projectId || summary.baselineId !== baselineId)
    throw new Error("Den gemte plan og baseline matcher ikke denne sag eller version.");
  const plan = await verificationPlanVersionFromRow(planRow, baseline, context);
  return { baseline, planRow, plan };
}

/** v1 creates a new logical round. No revision, photo binding or approval is supported. */
export async function executeSaveSurveyRound(
  raw: SaveSurveyRoundInput,
  userId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundDependencies> = {},
): Promise<SurveyRoundVersion> {
  const input = SaveSurveyRoundInputSchema.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const access = await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  if (!access.canPersist)
    throw new Error("Du har ikke rettighed til at oprette registreringsrunden.");
  const existing = await dependencies.loadRequest(client, input.projectId, userId, input.requestId);
  if (existing) {
    const summary = surveyRoundSummaryFromRow(existing);
    if (
      summary.projectId !== input.projectId ||
      summary.createdBy !== userId ||
      summary.requestId !== input.requestId ||
      summary.baselineId !== input.baselineId ||
      summary.baselineSha256 !== input.baselineSha256 ||
      summary.planId !== input.planId ||
      summary.planSha256 !== input.planSha256
    )
      throw new Error(
        "Denne anmodning er allerede brugt til en anden registreringsrunde eller inputversion.",
      );
  }
  const { baseline, planRow, plan } = await loadRequiredInputs(
    dependencies,
    client,
    input.projectId,
    input.baselineId,
    input.planId,
  );
  const desired = await buildSurveyRoundManifestV1(input, baseline, plan);
  if (existing) {
    const version = await surveyRoundVersionFromRow(existing, baseline, planRow);
    if (surveyRoundCanonicalText(version.manifest) !== surveyRoundCanonicalText(desired))
      throw new Error(
        "Denne anmodning er allerede brugt til en anden registreringsrunde eller periode.",
      );
    return version;
  }
  const writer = await dependencies.getWriter();
  const persisted = await dependencies.persist(writer, input, userId, desired);
  const version = await surveyRoundVersionFromRow(persisted, baseline, planRow);
  if (
    version.projectId !== input.projectId ||
    version.createdBy !== userId ||
    version.requestId !== input.requestId ||
    version.baselineId !== input.baselineId ||
    version.baselineSha256 !== input.baselineSha256 ||
    version.planId !== input.planId ||
    version.planSha256 !== input.planSha256 ||
    surveyRoundCanonicalText(version.manifest) !== surveyRoundCanonicalText(desired)
  )
    throw new Error("Databasen bekræftede ikke den ønskede registreringsrunde.");
  return version;
}

export async function executeSaveSurveyRoundForCaller(
  raw: SaveSurveyRoundEnvelope,
  userId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundDependencies> = {},
): Promise<SurveyRoundVersion> {
  const envelope = SaveSurveyRoundEnvelopeSchema.parse(raw);
  if (envelope.expectedCallerUserId !== userId)
    throw new Error("Login er ændret. Genåbn registreringsrunden under den aktuelle bruger.");
  const { expectedCallerUserId: _callerHint, ...input } = envelope;
  // The verified context remains the actor. The hint cannot select identity or rights.
  return executeSaveSurveyRound(input, userId, client, overrides);
}

export async function executeGetSurveyRound(
  raw: z.infer<typeof GetSurveyRoundInputSchema>,
  userId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundDependencies> = {},
): Promise<SurveyRoundVersion | null> {
  const input = GetSurveyRoundInputSchema.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  const row = await dependencies.loadRound(client, input.projectId, input.roundVersionId);
  if (!row) return null;
  const summary = surveyRoundSummaryFromRow(row);
  if (summary.projectId !== input.projectId || summary.id !== input.roundVersionId)
    throw new Error("Den gemte registreringsrunde matcher ikke denne sag eller version.");
  // This context belongs to this authorized read only; it never contains access decisions.
  const context = createVerifiedInputContext();
  const { baseline, plan } = await loadRequiredInputs(
    dependencies,
    client,
    input.projectId,
    summary.baselineId,
    summary.planId,
    context,
  );
  return surveyRoundVersionFromRow(row, baseline, plan, context);
}

export async function executeListSurveyRounds(
  raw: ListSurveyRoundsInput,
  userId: string,
  client: SurveyRoundClient,
  overrides: Partial<SurveyRoundDependencies> = {},
): Promise<SurveyRoundPage> {
  const input = ListSurveyRoundsInputSchema.parse(raw);
  const dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
  await dependencies.authorizeProject(
    client as unknown as ProjectAuthorizationClient,
    userId,
    input.projectId,
  );
  const rows = await dependencies.listRounds(client, input);
  if (rows.length > input.limit + 1)
    throw new Error("Databasen returnerede for mange registreringsrunder.");
  const summaries = rows.map(surveyRoundSummaryFromRow);
  if (
    new Set(summaries.map((row) => row.id)).size !== summaries.length ||
    summaries.some(
      (row, index) =>
        row.projectId !== input.projectId ||
        (input.roundId && row.roundId !== input.roundId) ||
        (input.baselineId && row.baselineId !== input.baselineId) ||
        (input.planId && row.planId !== input.planId) ||
        (input.beforeVersion && row.version >= input.beforeVersion) ||
        (index > 0 && summaries[index - 1].version <= row.version),
    )
  )
    throw new Error(
      "Registreringsrunderne matcher ikke sagen, inputversionerne eller sidens rækkefølge.",
    );
  const items = summaries.slice(0, input.limit);
  return {
    items,
    nextBeforeVersion: summaries.length > input.limit ? items.at(-1)!.version : null,
  };
}

export const saveSurveyRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SaveSurveyRoundEnvelopeSchema.parse(raw))
  .handler(({ data, context }) =>
    executeSaveSurveyRoundForCaller(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRoundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    GetSurveyRoundInputSchema.omit({ roundVersionId: true }).parse(raw),
  )
  .handler(({ data, context }) =>
    executeGetSurveyRoundAccess(
      data,
      context.userId,
      context.supabase as unknown as SurveyRoundClient,
    ),
  );
export const getSurveyRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => GetSurveyRoundInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeGetSurveyRound(data, context.userId, context.supabase as unknown as SurveyRoundClient),
  );
export const listSurveyRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ListSurveyRoundsInputSchema.parse(raw))
  .handler(({ data, context }) =>
    executeListSurveyRounds(data, context.userId, context.supabase as unknown as SurveyRoundClient),
  );
