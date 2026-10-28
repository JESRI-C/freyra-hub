import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import type { WorkspaceEntry } from "@/lib/project-workspace";
import { executionRevisions, latestExecutions } from "@/lib/action-execution";
import { WorkflowReportSnapshotSchema } from "@/lib/workflow-report";
import { newReportContent, type ReportContent, type ReportRevision } from "@/lib/report-document";
import { listActionExecutions } from "./action-execution-service";
import {
  listPhotoComparisons,
  latestPhotoComparisons,
  inspectPhotoComparison,
} from "./photo-comparison-service";
import { assertProjectScope, type ProjectScope } from "./project-workspace-service";
import { loadReportSources, saveReportDocument } from "./report-document-service";
import { baselineSha256 } from "./baseline/public-baseline-service";

async function pinnedInputs(
  scope: ProjectScope,
  entries: WorkspaceEntry[],
  selectedRoundId?: string,
) {
  if (!supabase) throw new Error("Database er ikke konfigureret.");
  const db = supabase as unknown as SupabaseClient;
  const roundIds = [
    ...new Set([
      ...(selectedRoundId ? [selectedRoundId] : []),
      ...executionRevisions(entries).flatMap((e) =>
        e.execution.surveyRoundId ? [e.execution.surveyRoundId] : [],
      ),
    ]),
  ];
  if (!roundIds.length) return { rounds: [], baselines: [], plans: [] };
  const rounds = await db
    .from("survey_round_versions")
    .select("id,manifest_sha256,baseline_id,plan_id")
    .eq("project_id", scope.projectId)
    .in("id", roundIds);
  if (rounds.error || rounds.data?.length !== roundIds.length)
    throw new Error("Et besøg mangler i rapportgrundlaget.");
  const pins = rounds.data.map((row) => ({
    id: row.id as string,
    sha256: row.manifest_sha256 as string,
    baselineId: row.baseline_id as string,
    planId: row.plan_id as string,
  }));
  async function snapshots(table: string, ids: string[]) {
    const unique = [...new Set(ids)];
    const result = await db
      .from(table)
      .select("id,manifest_sha256,manifest")
      .eq("project_id", scope.projectId)
      .in("id", unique);
    if (result.error || result.data?.length !== unique.length)
      throw new Error("En fast kildeversion mangler.");
    return Promise.all(
      result.data.map(async (row) => {
        if ((await baselineSha256(row.manifest)) !== row.manifest_sha256)
          throw new Error("Kildeversionens kontrolsum stemmer ikke.");
        return {
          id: row.id as string,
          sha256: row.manifest_sha256 as string,
          manifest: row.manifest as Record<string, unknown>,
        };
      }),
    );
  }
  const [baselines, plans] = await Promise.all([
    snapshots(
      "project_baseline_snapshots",
      pins.map((p) => p.baselineId),
    ),
    snapshots(
      "verification_plan_versions",
      pins.map((p) => p.planId),
    ),
  ]);
  return { rounds: pins, baselines, plans };
}
export async function buildWorkflowReportContent(
  scope: ProjectScope,
  selectedRoundId?: string,
): Promise<ReportContent> {
  const project = await assertProjectScope(scope);
  const [history, comparisonHistory, sourceRegister] = await Promise.all([
    listActionExecutions(scope),
    listPhotoComparisons(scope),
    loadReportSources(scope.projectId),
  ]);
  const executions = latestExecutions(history);
  const comparisons = latestPhotoComparisons(comparisonHistory);
  if (!executions.length && !comparisons.length)
    throw new Error("Registrér først udførelse eller et fotopar.");
  const inspected = await Promise.all(
    comparisons.map(({ comparison }) => inspectPhotoComparison(scope, comparison)),
  );
  const selectedIds = new Set(executions.map((e) => e.entry.id));
  comparisons.forEach((c) => selectedIds.add(c.comparison.executionRevisionId));
  const inputs = [
    ...history.filter((e) => selectedIds.has(e.id)),
    ...comparisons.map((c) => c.entry),
  ];
  const pinned = await pinnedInputs(scope, inputs, selectedRoundId);
  const limitations = [
    "Beskrivende dokumentation; ingen kvantitativ natureffekt eller myndighedstilladelse.",
    ...inspected.flatMap((value) => value.assessment.gaps),
    ...(!pinned.rounds.length ? ["Intet versionsbundet besøg eller baseline er valgt."] : []),
    ...(!comparisons.length ? ["Før/efter-par mangler."] : []),
  ];
  const workflowSnapshot = WorkflowReportSnapshotSchema.parse({
    schema: "freyra.workflow-report/v1",
    generatorVersion: "workflow-report/v1",
    ...scope,
    dataBasis: "real",
    inputs,
    ...pinned,
    limitations,
    review: null,
  });
  const sourceIds = new Set([
    ...comparisons.flatMap((c) => [
      "media:" + c.comparison.beforeId,
      "media:" + c.comparison.afterId,
    ]),
    ...executions.flatMap((e) => e.execution.evidenceIds.map((id) => "evidence:" + id)),
  ]);
  const sources = sourceRegister.filter((s) => sourceIds.has(s.id));
  if (sources.length !== sourceIds.size)
    throw new Error("En rapportkilde er ikke tilgængelig på sagen.");
  const content = newReportContent(
    project.name,
    "Projektets organisation",
    "Før/efter og faktisk grødeskæring",
    "Projektets medarbejdere og faglige reviewer",
  );
  const texts = [
    [
      "Formål og versioner",
      "Beskrivende før/efter-dokumentation. Generator workflow-report/v1. Alle inputversioner er fastholdt i rapportens kildepakke.",
    ],
    [
      "Baseline og besøg",
      pinned.rounds.length
        ? pinned.rounds
            .map((p) => "Besøg " + p.id + " · SHA-256 " + p.sha256 + " · baseline " + p.baselineId)
            .join("\n")
        : "Besøg og baseline mangler.",
    ],
    [
      "Faktisk udførelse",
      executions
        .map(
          ({ execution: e, entry }) =>
            "Version " +
            entry.version +
            " · " +
            (e.stage === "performed" ? "Registreret udførelse" : "Planlagt, ikke udført") +
            " · " +
            (e.actualDate ?? "Faktisk dato mangler") +
            (e.actualEndDate ? " til " + e.actualEndDate : "") +
            "\nMetode: " +
            (e.method || "Uafklaret") +
            "\nStrækning: " +
            (e.reach || "Uafklaret") +
            "\nUdførende: " +
            (e.performedBy || "Ukendt") +
            "\nKilde: " +
            e.sourceReference +
            "\nAfvigelser: " +
            (e.deviation || "Ikke registreret") +
            "\nDækning: " +
            e.coverageDescription,
        )
        .join("\n\n"),
    ],
    [
      "Før og efter",
      comparisons
        .map(
          ({ comparison: c }, i) =>
            "Før: " +
            c.beforeId +
            " · efter: " +
            c.afterId +
            "\nUdførelsesrevision: " +
            c.executionRevisionId +
            "\nStatus: " +
            inspected[i].assessment.status +
            "\nSamme sted: " +
            c.samePlaceEvidence +
            "\nDækning: " +
            c.coverageDescription +
            "\nUdeladt: " +
            c.excludedAreas +
            "\nOptageforskelle: " +
            c.captureDifferences +
            "\nBrugerens beskrivelse: " +
            c.conclusion +
            "\nMangler: " +
            (inspected[i].assessment.gaps.join(" ") ||
              "Ingen yderligere registrerede datamangler; fagligt review afventer."),
        )
        .join("\n\n") || "Før/efter-par mangler.",
    ],
    [
      "Begrænsninger og review",
      limitations.join("\n") +
        "\nVersionsafgrænset dokumentationsreview afventer. Ingen natureffekt er godkendt.",
    ],
    [
      "Næste opfølgning",
      "Opfølgningsopgaver genfindes på sagen. Rapporten må kun beskrive faktisk registrerede aftaler.",
    ],
  ];
  return {
    ...content,
    title: project.name + " · før/efter af grødeskæring",
    sources,
    workflowSnapshot,
    sections: texts.map(([title, text], i) => ({
      id: "workflow-" + i,
      title,
      text,
      sourceIds: sources.map((s) => s.id),
      reviewed: false,
      basis: "not_measured" as const,
    })),
  };
}
export async function saveWorkflowReport(
  scope: ProjectScope,
  selectedRoundId?: string,
  previous?: ReportRevision,
) {
  const content = await buildWorkflowReportContent(scope, selectedRoundId);
  return saveReportDocument({
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    reportId: previous?.report_id ?? null,
    expectedVersion: previous?.version ?? 0,
    status: "draft",
    content,
  });
}
