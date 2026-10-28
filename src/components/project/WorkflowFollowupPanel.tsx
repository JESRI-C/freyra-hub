import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import type { ProjectScope } from "@/services/project-workspace-service";
import type { WorkspaceEntry } from "@/lib/project-workspace";
import { latestExecutions } from "@/lib/action-execution";
import { latestWorkflowFollowups, type WorkflowFollowup } from "@/lib/workflow-followup";
import {
  listWorkflowFollowups,
  refreshWorkflowFollowups,
  saveWorkflowFollowup,
} from "@/services/workflow-followup-service";
import { listActionExecutions } from "@/services/action-execution-service";
import { listPhotoComparisons } from "@/services/photo-comparison-service";
const labels = {
  proposed: "Forslag",
  assigned: "Tildelt",
  dismissed: "Afvist",
  completed: "Afsluttet",
};
export function WorkflowFollowupPanel({
  scope,
  canEdit,
}: {
  scope: ProjectScope;
  canEdit: boolean;
}) {
  const cache = useQueryClient();
  const key = ["workflow-followups", scope.organizationId, scope.projectId];
  const records = useQuery({
    queryKey: key,
    queryFn: () => listWorkflowFollowups(scope),
    retry: false,
  });
  const executions = useQuery({
    queryKey: ["action-executions", scope.organizationId, scope.projectId],
    queryFn: () => listActionExecutions(scope),
    retry: false,
  });
  const comparisons = useQuery({
    queryKey: ["photo-comparisons", scope.organizationId, scope.projectId],
    queryFn: () => listPhotoComparisons(scope),
    retry: false,
  });
  const [draft, setDraft] = useState<WorkflowFollowup | null>(null);
  const [base, setBase] = useState<WorkspaceEntry | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signature = [...(executions.data ?? []), ...(comparisons.data ?? [])]
    .map((e) => e.id)
    .sort()
    .join(":");
  const inputsReady = executions.isSuccess && comparisons.isSuccess;
  useEffect(() => {
    if (!canEdit || !inputsReady) return;
    let alive = true;
    void refreshWorkflowFollowups(scope)
      .then(() => cache.invalidateQueries({ queryKey: key }))
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Forslag kunne ikke opdateres.");
      });
    return () => {
      alive = false;
    };
    // The signature pins the complete source-version set; repeated events are idempotent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, inputsReady, signature, scope.organizationId, scope.projectId]);
  const current = latestWorkflowFollowups(records.data ?? []);
  const sources = latestExecutions(executions.data ?? []);
  const field = "mt-1 block w-full rounded border bg-background p-2";
  return (
    <section aria-label="Næste opfølgning" className="space-y-3 rounded border p-4">
      <h3 className="font-semibold">Næste opfølgning</h3>
      <p>
        Mangler giver interne forslag med kilde og årsag. Tildeling og planlagt dato er særskilte
        registreringer; der sendes ingen mails. Afvisning respekteres ved samme grundlag.
      </p>
      {(records.isError || executions.isError || comparisons.isError) && (
        <p role="alert">Opgaver eller grundlag kunne ikke hentes. Genindlæs.</p>
      )}
      {!records.isSuccess && <p role="status">Henter opfølgning…</p>}
      {current.map(({ entry, followup }) => (
        <article className="rounded border p-3" key={entry.id}>
          <h4 className="font-medium">{followup.title}</h4>
          <p>
            {labels[followup.status]} · Ansvarlig: {followup.assignee || "Ikke aftalt"} · Planlagt
            dato: {followup.dueDate || "Ikke aftalt"}
          </p>
          <p>{followup.reason}</p>
          <p className="text-xs">Kildeversioner: {followup.sourceIds.join(", ")}</p>
          <p>
            {followup.notes} {followup.resolutionReason}
          </p>
          {canEdit && (
            <Button
              variant="outline"
              onClick={() => {
                setBase(entry);
                setDraft(followup);
                setError("");
              }}
            >
              Redigér opfølgning
            </Button>
          )}
          <details>
            <summary>Ændringshistorik</summary>
            {(records.data ?? [])
              .filter((e) => e.entry_id === entry.entry_id)
              .sort((a, b) => b.version - a.version)
              .map((e) => (
                <p key={e.id} className="whitespace-pre-wrap break-words text-xs">
                  v{e.version} · {e.created_at} · {e.created_by}: {e.payload.decision}
                </p>
              ))}
          </details>
        </article>
      ))}
      {canEdit && (
        <Button
          disabled={!inputsReady || !records.isSuccess || !sources.length}
          onClick={() => {
            setBase(undefined);
            setError("");
            setDraft({
              schema: "freyra.workflow-followup/v1",
              eventKey: "manual-visit:" + crypto.randomUUID(),
              title: "Planlæg næste opfølgning",
              reason: "Planlagt genbesøg; tidspunkt, formål og ansvar skal afklares.",
              sourceIds: [sources[0].entry.id],
              status: "proposed",
              assignee: null,
              dueDate: null,
              notes: "",
              resolutionReason: "",
            });
          }}
        >
          Planlæg genbesøg
        </Button>
      )}
      {draft && (
        <form
          className="space-y-3 rounded border p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!canEdit) return;
            setBusy(true);
            setError("");
            try {
              await saveWorkflowFollowup(scope, draft, base);
              await cache.invalidateQueries({ queryKey: key });
              setDraft(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Opgaven kunne ikke gemmes.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || !canEdit} className="space-y-3">
            <legend>Opfølgningsopgave</legend>
            <label className="block">
              Status
              <select
                className={field}
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as WorkflowFollowup["status"] })
                }
              >
                {Object.entries(labels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(["title", "reason", "assignee", "notes", "resolutionReason"] as const).map((name) => (
              <label className="block" key={name}>
                {
                  {
                    title: "Opgave",
                    reason: "Årsag og formål",
                    assignee: "Ansvarlig",
                    notes: "Planlagt metode, sted og bemærkninger",
                    resolutionReason: "Begrundelse for afvisning eller afslutning",
                  }[name]
                }
                <textarea
                  className={field}
                  value={draft[name] ?? ""}
                  maxLength={name === "title" ? 200 : 2000}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [name]: name === "assignee" ? e.target.value || null : e.target.value,
                    })
                  }
                />
              </label>
            ))}
            <label className="block">
              Planlagt dato (ikke automatisk en bekræftet aftale)
              <input
                className={field}
                type="date"
                value={draft.dueDate ?? ""}
                onChange={(e) => setDraft({ ...draft, dueDate: e.target.value || null })}
              />
            </label>
          </fieldset>
          <Button disabled={busy}>Gem opfølgningsversion</Button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
