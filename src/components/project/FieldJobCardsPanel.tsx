import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getFieldJobAccess } from "@/lib/field-job-access.functions";
import {
  FIELD_JOB_STARTER_TEMPLATES,
  FieldJobTemplateDefinitionSchema,
  fieldJobGaps,
  type FieldJobTemplateDefinition,
  type FieldJobValues,
  type FieldJobVersion,
} from "@/lib/field-job-cards";
import {
  listFieldJobActions,
  listFieldJobTemplates,
  listFieldJobVersions,
  saveFieldJobTemplate,
  saveFieldJobVersion,
} from "@/services/field-job-cards-service";
import type { ProjectScope } from "@/services/project-workspace-service";
import { Button } from "@/components/ui/button";

const control = "mt-1 block w-full rounded border bg-background p-2";
export function FieldJobCardsPanel({ scope }: { scope: ProjectScope }) {
  const { user } = useAuth();
  return (
    <JobCards
      key={`${scope.organizationId}:${scope.projectId}:${user?.id ?? "anonymous"}`}
      scope={scope}
      actorId={user?.id}
    />
  );
}
function JobCards({ scope, actorId }: { scope: ProjectScope; actorId?: string }) {
  const accessFn = useServerFn(getFieldJobAccess);
  const access = useQuery({
    queryKey: ["field-job-access", actorId, scope.projectId],
    queryFn: () => accessFn({ data: { projectId: scope.projectId } }),
    enabled: !!actorId,
    retry: false,
  });
  const enabled =
    !!actorId &&
    access.data?.userId === actorId &&
    access.data.projectId === scope.projectId &&
    !access.isError;
  const actions = useQuery({
    queryKey: ["field-job-actions", actorId, scope],
    queryFn: () => listFieldJobActions(scope),
    enabled,
    retry: false,
  });
  const templates = useQuery({
    queryKey: ["field-job-templates", actorId, scope],
    queryFn: () => listFieldJobTemplates(scope),
    enabled,
    retry: false,
  });
  const [actionId, setActionId] = useState("");
  return (
    <section aria-label="Jobkort" className="space-y-4 rounded border p-4">
      <h2 className="text-lg font-semibold">Jobkort og feltregistrering</h2>
      <p className="text-sm text-muted-foreground">
        Tilpas en skabelon og registrér oplysninger på en eksisterende opgave. Versioner bevares.
        Denne version kræver netforbindelse.
      </p>
      {!actorId && <p>Log ind for at åbne jobkort.</p>}
      {(access.isFetching || actions.isFetching || templates.isFetching) && (
        <p role="status">Henter jobkort…</p>
      )}
      {(access.error || actions.error || templates.error) && (
        <p role="alert">{(access.error || actions.error || templates.error)?.message}</p>
      )}
      {enabled && actions.data && templates.data && (
        <>
          {!actions.data.length ? (
            <p>Opret først en handling på sagen for at tilknytte et jobkort.</p>
          ) : (
            <label className="block">
              Opgave
              <select
                className={control}
                value={actionId}
                onChange={(e) => setActionId(e.target.value)}
              >
                <option value="">Vælg opgave</option>
                {actions.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title} · {a.status}
                  </option>
                ))}
              </select>
            </label>
          )}
          {actionId && (
            <JobCardEditor
              key={actionId}
              scope={scope}
              actorId={actorId!}
              actionId={actionId}
              templates={templates.data}
              canConfigure={!!access.data?.canConfigure && !access.isFetching}
              canContribute={!!access.data?.canContribute && !access.isFetching}
            />
          )}
        </>
      )}
    </section>
  );
}
type Templates = Awaited<ReturnType<typeof listFieldJobTemplates>>;
function JobCardEditor({
  scope,
  actorId,
  actionId,
  templates,
  canConfigure,
  canContribute,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  templates: Templates;
  canConfigure: boolean;
  canContribute: boolean;
}) {
  const cache = useQueryClient();
  const history = useQuery({
    queryKey: ["field-job-versions", actorId, scope, actionId],
    queryFn: () => listFieldJobVersions(scope, actionId),
    retry: false,
  });
  const [base, setBase] = useState<FieldJobVersion>();
  const [templateId, setTemplateId] = useState("");
  const [values, setValues] = useState<FieldJobValues>({});
  const [status, setStatus] = useState<FieldJobVersion["status"]>("draft");
  const [reason, setReason] = useState("");
  const [definition, setDefinition] = useState<FieldJobTemplateDefinition>(() =>
    structuredClone(FIELD_JOB_STARTER_TEMPLATES[0]),
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);
  const alive = useRef(true);
  const request = useRef({ payload: "", id: "" });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (history.data && !initialized.current) {
      initialized.current = true;
      const latest = history.data[0];
      if (latest) {
        setBase(latest);
        setTemplateId(latest.template_version_id);
        setValues(latest.values);
        setStatus(latest.status);
      }
    }
  }, [history.data]);
  const selected = templates.find((t) => t.id === templateId);
  const writable = canContribute && (!!base || canConfigure);
  function requestId(payload: unknown) {
    const text = JSON.stringify(payload);
    if (request.current.payload !== text)
      request.current = { payload: text, id: crypto.randomUUID() };
    return request.current.id;
  }
  async function persistTemplate() {
    if (!canConfigure || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const parsed = FieldJobTemplateDefinitionSchema.parse(definition);
      const input = {
        templateId: selected?.template_id ?? crypto.randomUUID(),
        definition: parsed,
        expectedVersion: selected?.version ?? 0,
      };
      // Persist the first template identity across uncertain retries as well as its request ID.
      const stable = selected
        ? input
        : {
            ...input,
            templateId: request.current.payload.startsWith("new-template:")
              ? JSON.parse(request.current.payload.slice(13)).templateId
              : input.templateId,
          };
      const payload = JSON.stringify(stable);
      if (!selected) {
        if (request.current.payload !== "new-template:" + payload)
          request.current = { payload: "new-template:" + payload, id: crypto.randomUUID() };
      }
      const saved = await saveFieldJobTemplate(scope, {
        ...stable,
        requestId: selected ? requestId(stable) : request.current.id,
      });
      await cache.invalidateQueries({ queryKey: ["field-job-templates", actorId, scope] });
      if (alive.current) {
        setTemplateId(saved.id);
        setMessage("Skabelonversion gemt. Gem registreringen for at tilknytte den til opgaven.");
        request.current = { payload: "", id: "" };
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Skabelonen kunne ikke gemmes.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (!selected || !writable || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const input = {
        actionId,
        templateVersionId: selected.id,
        values,
        status,
        correctionReason: reason,
        expectedVersion: base?.version ?? 0,
      };
      const saved = await saveFieldJobVersion(scope, { ...input, requestId: requestId(input) });
      await cache.invalidateQueries({ queryKey: ["field-job-versions", actorId, scope, actionId] });
      if (alive.current) {
        setBase(saved);
        setValues(saved.values);
        setReason("");
        setMessage(
          `Registrering gemt som version ${saved.version}. Det er ikke en ekspertgodkendelse.`,
        );
        request.current = { payload: "", id: "" };
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "Registreringen kunne ikke gemmes.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const latestTemplates = templates.filter(
    (t) =>
      !templates.some((other) => other.template_id === t.template_id && other.version > t.version),
  );
  const options =
    selected && !latestTemplates.some((t) => t.id === selected.id)
      ? [selected, ...latestTemplates]
      : latestTemplates;
  let gaps: string[] = [];
  if (selected) {
    try {
      gaps = fieldJobGaps(selected.definition, values);
    } catch {
      gaps = ["Svarene skal passe til den valgte skabelon."];
    }
  }
  return (
    <div className="space-y-4">
      {history.isFetching && <p role="status">Henter registreringshistorik…</p>}
      {history.error && <p role="alert">{history.error.message}</p>}
      {!canContribute && <p>Du har læseadgang til jobkortet.</p>}
      {canContribute && !canConfigure && !base && (
        <p>En redaktør skal først tilknytte en skabelon til opgaven.</p>
      )}
      <label className="block">
        Skabelon
        <select
          className={control}
          disabled={!canConfigure || busy}
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            setValues({});
            setMessage("");
          }}
        >
          <option value="">Vælg gemt skabelon</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.definition.title} · version {t.version}
            </option>
          ))}
        </select>
      </label>
      {canConfigure && (
        <details>
          <summary>Opret eller tilpas skabelon</summary>
          <div className="space-y-3 pt-3">
            <label className="block">
              Udgangspunkt
              <select
                className={control}
                onChange={(e) =>
                  setDefinition(
                    structuredClone(FIELD_JOB_STARTER_TEMPLATES[Number(e.target.value)]),
                  )
                }
              >
                {FIELD_JOB_STARTER_TEMPLATES.map((t, i) => (
                  <option key={t.domain} value={i}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setDefinition(structuredClone(selected.definition))}
              >
                Tilpas valgt skabelon
              </Button>
            )}
            <label className="block">
              Skabelonens titel
              <input
                className={control}
                maxLength={160}
                value={definition.title}
                onChange={(e) => setDefinition({ ...definition, title: e.target.value })}
              />
            </label>
            {definition.fields.map((f, i) => (
              <fieldset key={f.key} className="rounded border p-2">
                <legend>
                  Felt {i + 1} · {f.type}
                </legend>
                <label>
                  Overskrift
                  <input
                    className={control}
                    value={f.label}
                    maxLength={120}
                    onChange={(e) =>
                      setDefinition({
                        ...definition,
                        fields: definition.fields.map((field, n) =>
                          n === i ? { ...field, label: e.target.value } : field,
                        ),
                      })
                    }
                  />
                </label>
                <label className="block">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) =>
                      setDefinition({
                        ...definition,
                        fields: definition.fields.map((field, n) =>
                          n === i ? { ...field, required: e.target.checked } : field,
                        ),
                      })
                    }
                  />{" "}
                  Vis som nødvendigt felt
                </label>
                {f.type === "select" && (
                  <label>
                    Valgmuligheder, én pr. linje
                    <textarea
                      className={control}
                      value={f.options?.join("\n")}
                      onChange={(e) =>
                        setDefinition({
                          ...definition,
                          fields: definition.fields.map((field, n) =>
                            n === i ? { ...field, options: e.target.value.split("\n") } : field,
                          ),
                        })
                      }
                    />
                  </label>
                )}
              </fieldset>
            ))}
            <label className="block">
              Tilføj felt
              <select
                className={control}
                value=""
                disabled={definition.fields.length >= 40}
                onChange={(e) => {
                  const type = e.target.value as (typeof definition.fields)[number]["type"];
                  setDefinition({
                    ...definition,
                    fields: [
                      ...definition.fields,
                      {
                        key: "field_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20),
                        label: "Nyt felt",
                        type,
                        required: false,
                        ...(type === "select" ? { options: ["Ja", "Nej"] } : {}),
                      },
                    ],
                  });
                }}
              >
                <option value="">Vælg felttype</option>
                {["text", "textarea", "number", "date", "boolean", "select"].map((t) => (
                  <option key={t} value={t}>
                    {
                      {
                        text: "Tekst",
                        textarea: "Lang tekst",
                        number: "Tal",
                        date: "Dato",
                        boolean: "Ja/nej",
                        select: "Valgliste",
                      }[t]
                    }
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy || history.isError} onClick={() => void persistTemplate()}>
              Gem ny skabelonversion
            </Button>
          </div>
        </details>
      )}
      {selected && (
        <>
          <p className="text-sm">
            Denne registrering bruger skabelonversion {selected.version}. Rettelser bevarer
            tidligere versioner.
          </p>
          {selected.definition.fields.map((f) => (
            <label className="block" key={f.key}>
              {f.label}
              {f.unit ? ` (${f.unit})` : ""}
              {f.required ? " · nødvendigt" : ""}
              {f.helpText && (
                <span className="block text-sm text-muted-foreground">{f.helpText}</span>
              )}
              {f.type === "boolean" || f.type === "select" ? (
                <select
                  className={control}
                  disabled={!writable || busy}
                  value={values[f.key] == null ? "" : String(values[f.key])}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.key]:
                        e.target.value === ""
                          ? null
                          : f.type === "boolean"
                            ? e.target.value === "true"
                            : e.target.value,
                    })
                  }
                >
                  <option value="">Ikke registreret</option>
                  {(f.type === "boolean" ? ["true", "false"] : f.options!).map((o) => (
                    <option key={o} value={o}>
                      {f.type === "boolean" ? (o === "true" ? "Ja" : "Nej") : o}
                    </option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  className={control}
                  disabled={!writable || busy}
                  maxLength={4000}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              ) : (
                <input
                  className={control}
                  disabled={!writable || busy}
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  step={f.type === "number" ? "any" : undefined}
                  maxLength={4000}
                  value={String(values[f.key] ?? "")}
                  onChange={(e) =>
                    setValues({
                      ...values,
                      [f.key]:
                        f.type === "number"
                          ? e.target.value === ""
                            ? null
                            : Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              )}
            </label>
          ))}
          {gaps.length > 0 && (
            <div className="text-sm">
              <p>Mangler kan gemmes og afklares senere:</p>
              <ul>
                {gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
          <label className="block">
            Vurderingsstatus
            <select
              className={control}
              disabled={!writable || busy}
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="draft">Kladde</option>
              <option value="recorded">Registreret af medarbejder</option>
              <option value="needs_review">Til ekstra vurdering</option>
            </select>
          </label>
          {base && (
            <label className="block">
              Årsag til rettelse
              <textarea
                className={control}
                disabled={!writable || busy}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {writable && (
            <Button
              disabled={busy || history.isFetching || history.isError}
              onClick={() => void save()}
            >
              Gem registreringsversion
            </Button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!!history.data?.length && (
        <details>
          <summary>Historik · seneste {history.data.length} versioner</summary>
          <ul>
            {history.data.map((v) => (
              <li key={v.id} className="border-b py-2">
                Version {v.version} · {new Date(v.created_at).toLocaleString("da-DK")} · {v.status}
                <p>{v.correction_reason}</p>
                <details>
                  <summary>Vis gemte svar</summary>
                  <dl>
                    {Object.entries(v.values).map(([key, value]) => (
                      <div key={key}>
                        <dt>
                          {templates
                            .find((t) => t.id === v.template_version_id)
                            ?.definition.fields.find((f) => f.key === key)?.label ?? key}
                        </dt>
                        <dd>
                          {value === null
                            ? "Ikke registreret"
                            : typeof value === "boolean"
                              ? value
                                ? "Ja"
                                : "Nej"
                              : String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
