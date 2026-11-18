import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  entryDefinitions,
  latestEntries,
  type EntryKind,
  type WorkspaceEntry,
} from "@/lib/project-workspace";
import { saveWorkspaceEntry, type ProjectScope } from "@/services/project-workspace-service";
import type { ProjectNavigationSearch } from "@/lib/project-navigation";

function entryWorkspace(
  entry: WorkspaceEntry,
): { label: string; search: ProjectNavigationSearch } | undefined {
  if (entry.kind !== "decision_note") return;
  const source = entry.payload.source ?? "";
  if (source === `action-execution:${entry.entry_id}`)
    return {
      label: "Udført arbejde",
      search: { tab: "handlinger", task: entry.entry_id, work: "execution" },
    };
  if (source === `workflow-followup:${entry.entry_id}`)
    return { label: "Rapport og opfølgning", search: { tab: "rapporter" } };
  if (source.startsWith("photo-comparison:"))
    return { label: "Før og efter", search: { step: "sammenligning" } };
  if (source.startsWith("photo-atlas:")) return { label: "Fotoatlas", search: { tab: "medier" } };
}

export function WorkspaceEntries({
  kind,
  entries,
  scope,
  canEdit,
}: {
  kind: EntryKind;
  entries: WorkspaceEntry[];
  scope: ProjectScope;
  canEdit: boolean;
}) {
  const definition = entryDefinitions[kind];
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WorkspaceEntry | null | undefined>();
  const [title, setTitle] = useState("");
  const [payload, setPayload] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<string | null>(null);
  const versions = entries.filter((e) => e.kind === kind);
  const current = latestEntries(versions);
  const mutation = useMutation({
    mutationFn: () => {
      if (editing && entryWorkspace(editing))
        throw new Error("Åbn registreringens eget arbejdsrum for at rette den.");
      return saveWorkspaceEntry(scope, { kind, title, payload, previous: editing ?? undefined });
    },
    onSuccess: async () => {
      setEditing(undefined);
      await qc.invalidateQueries({ queryKey: ["project-workspace"] });
    },
  });
  function edit(entry: WorkspaceEntry | null) {
    if (entry && entryWorkspace(entry)) return;
    mutation.reset();
    setEditing(entry);
    setTitle(entry?.title ?? "");
    setPayload(entry?.payload ?? {});
  }
  function value(entry: WorkspaceEntry, key: string) {
    const workspace = entryWorkspace(entry);
    return key === "decision" && workspace ? (
      <span>
        Se registreringens oplysninger og historik under{" "}
        <Link
          to="/app/projects/$slug"
          params={{ slug: scope.projectId }}
          search={workspace.search}
          className="underline underline-offset-4"
        >
          {workspace.label}
        </Link>
        .
      </span>
    ) : (
      entry.payload[key] || "Ikke oplyst"
    );
  }
  return (
    <section className="min-w-0 space-y-4 [overflow-wrap:anywhere]" aria-label={definition.label}>
      <p className="text-sm text-muted-foreground">{definition.description}</p>
      {canEdit && editing === undefined && (
        <Button onClick={() => edit(null)}>Opret {definition.label.toLowerCase()}</Button>
      )}
      {!canEdit && <p className="text-sm text-muted-foreground">Din adgang er læseadgang.</p>}
      {editing !== undefined && (
        <form
          className="rounded-xl border p-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block text-sm">
            Titel
            <input
              className="block border rounded p-2 w-full"
              value={title}
              required
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <div className="grid md:grid-cols-2 gap-3">
            {definition.fields.map((field) => (
              <label className="block text-sm" key={field.key}>
                {field.label}
                {field.options ? (
                  <select
                    className="block border rounded p-2 w-full"
                    required={field.required}
                    value={payload[field.key] ?? ""}
                    onChange={(e) => setPayload({ ...payload, [field.key]: e.target.value })}
                  >
                    <option value="">Ikke oplyst</option>
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    className="block border rounded p-2 w-full"
                    required={field.required}
                    maxLength={10000}
                    value={payload[field.key] ?? ""}
                    onChange={(e) => setPayload({ ...payload, [field.key]: e.target.value })}
                  />
                ) : (
                  <input
                    className="block border rounded p-2 w-full"
                    type={field.type ?? "text"}
                    min={field.type === "number" ? 0 : undefined}
                    step={field.type === "number" ? "any" : undefined}
                    required={field.required}
                    value={payload[field.key] ?? ""}
                    onChange={(e) => setPayload({ ...payload, [field.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          {mutation.error && (
            <p role="alert" className="text-destructive">
              Kunne ikke gemme: {mutation.error.message}. Ved versionskonflikt: genindlæs og
              gennemgå ændringerne.
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={mutation.isPending}>
              Gem {editing ? `version ${editing.version + 1}` : "registrering"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setEditing(undefined)}
            >
              Annuller
            </Button>
          </div>
        </form>
      )}
      {current.length === 0 && <p>Ingen registreringer på dette projekt endnu.</p>}
      {current.map((entry) => (
        <article key={entry.id} className="rounded-xl border p-4 space-y-3">
          <h3 className="font-medium">{entry.title}</h3>
          <p className="text-xs text-muted-foreground">
            Version {entry.version} · {new Date(entry.created_at).toLocaleString("da-DK")} ·{" "}
            {entry.created_by}
          </p>
          <dl className="grid md:grid-cols-2 gap-3 text-sm">
            {definition.fields.map((field) => (
              <div key={field.key}>
                <dt className="text-muted-foreground">{field.label}</dt>
                <dd className="whitespace-pre-wrap">{value(entry, field.key)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            {canEdit && !entryWorkspace(entry) && (
              <Button variant="outline" onClick={() => edit(entry)}>
                Redigér
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setHistory(history === entry.entry_id ? null : entry.entry_id)}
            >
              Versionshistorik
            </Button>
          </div>
          {history === entry.entry_id && (
            <ol className="space-y-2">
              {versions
                .filter((v) => v.entry_id === entry.entry_id)
                .sort((a, b) => b.version - a.version)
                .map((v) => (
                  <li key={v.id}>
                    <details>
                      <summary>
                        Version {v.version} · {new Date(v.created_at).toLocaleString("da-DK")}
                      </summary>
                      <p>{v.title}</p>
                      <dl>
                        {definition.fields.map((f) => (
                          <div key={f.key}>
                            <dt>{f.label}</dt>
                            <dd className="whitespace-pre-wrap">{value(v, f.key)}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  </li>
                ))}
            </ol>
          )}
        </article>
      ))}
    </section>
  );
}
