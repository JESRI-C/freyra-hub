import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useConnectContext } from "@/lib/connect-context";
import {
  loadProjectWorkspace,
  createProjectAction,
  updateProjectAction,
  type ProjectWorkspace,
  type ProjectScope,
} from "@/services/project-workspace-service";
import { getMyProjectRole, permissionsFor } from "@/services/project-members-service";
import { latestEntries, type EntryKind } from "@/lib/project-workspace";
import { WorkspaceEntries } from "./WorkspaceEntries";
import { ActionItem } from "@/components/project/ActionItem";
import { DataSourcesPanel } from "@/components/project/DataSourcesPanel";
import { AuditTrailPanel } from "@/components/audit/AuditTrailPanel";
import { IndicatorDetail } from "@/components/indicators/IndicatorDetail";
import { EnvironmentalRiskTable } from "@/components/construction/EnvironmentalRiskTable";
import { Button } from "@/components/ui/button";

const workspacePages = {
  "decisions/index": "AI-overblik",
  "decisions/recommendations": "Anbefalinger",
  "decisions/risk": "Risiko & lodsejer",
  "decisions/scenarios": "Scenarier",
  "decisions/data-quality": "Metode & datakvalitet",
  "decisions/notes": "Beslutningsnotater",
  "decisions/assistant": "AI-assistent",
  "ledger/index": "ESG-overblik",
  "ledger/metrics": "Metrics & indikatorer",
  "ledger/csrd": "CSRD/ESRS",
  "ledger/co2": "CO₂-regnskab",
  "ledger/sources": "Datakilder",
  "ledger/audit": "Audit trail",
  "ledger/documents": "Dokumenter & bilag",
  "ledger/reporting": "Rapportering",
  "impact/index": "Impact-overblik",
  "impact/projects": "Projekter",
  "impact/project": "Projektprofil",
  "impact/portfolio": "Portefølje",
  "impact/credits": "Finansiering & midler",
  "impact/verification": "Verifikation",
  "impact/organizations": "Partnere & fonde",
  "impact/reports": "Impact-rapporter",
  "public-impact": "Public impact",
} as const;
export type WorkspacePage = keyof typeof workspacePages;
const entryPage: Partial<Record<WorkspacePage, EntryKind>> = {
  "decisions/scenarios": "scenario",
  "decisions/notes": "decision_note",
  "ledger/csrd": "esrs",
  "ledger/co2": "co2_entry",
  "impact/credits": "funding",
  "impact/organizations": "partner",
  "public-impact": "public_page",
};

export function ProjectWorkspacePage({ page }: { page: WorkspacePage }) {
  const auth = useAuth();
  const { projectId } = useConnectContext();
  const organizationId = auth.orgId;
  const query = useQuery({
    queryKey: ["project-workspace", auth.user?.id, organizationId, projectId],
    queryFn: () => loadProjectWorkspace({ organizationId: organizationId!, projectId: projectId! }),
    enabled: !!(auth.user && organizationId && projectId),
  });
  const role = useQuery({
    queryKey: ["project-role", auth.user?.id, projectId],
    queryFn: () => getMyProjectRole(projectId!, auth.user!.id),
    enabled: !!(auth.user && projectId),
  });
  const canEdit =
    ["owner", "admin", "editor"].includes(auth.currentOrg?.role ?? "") ||
    permissionsFor(role.data).canEdit;
  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5" data-workspace-page={page}>
      <header>
        <h1 className="text-2xl font-semibold">{workspacePages[page]}</h1>
        <p className="text-muted-foreground">
          {query.data?.project.name ?? "Vælg et projekt"} · {auth.currentOrg?.name}
        </p>
      </header>
      {!projectId || !organizationId ? (
        <p>Vælg en sag i projektvælgeren for at arbejde med dens data.</p>
      ) : query.isPending ? (
        <p role="status">Indlæser projektdata…</p>
      ) : query.error ? (
        <p role="alert">Projektdata kunne ikke indlæses: {query.error.message}</p>
      ) : (
        query.data && (
          <WorkspaceContent
            key={`${auth.user?.id}:${organizationId}:${projectId}:${page}`}
            page={page}
            data={query.data}
            scope={{ organizationId, projectId }}
            canEdit={canEdit}
          />
        )
      )}
      {query.isError && <Button onClick={() => query.refetch()}>Prøv igen</Button>}
    </main>
  );
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function Resource({
  name,
  data,
  children,
}: {
  name: keyof ProjectWorkspace;
  data: ProjectWorkspace;
  children: ReactNode;
}) {
  const error = data.errors[name as keyof typeof data.errors];
  return error ? (
    <p role="alert">
      Denne datakilde kunne ikke indlæses ({name}): {error}. Status er ukendt.
    </p>
  ) : (
    <>{children}</>
  );
}
function WorkspaceContent({
  page,
  data,
  scope,
  canEdit,
}: {
  page: WorkspacePage;
  data: ProjectWorkspace;
  scope: ProjectScope;
  canEdit: boolean;
}) {
  const kind = entryPage[page];
  return (
    <>
      {Object.keys(data.errors).length > 0 && (
        <details className="border rounded p-3">
          <summary>En eller flere datakilder kunne ikke indlæses</summary>
          {Object.entries(data.errors).map(([key, error]) => (
            <p role="alert" key={key}>
              {key}: {error}
            </p>
          ))}
        </details>
      )}
      {kind && (
        <Resource name="entries" data={data}>
          <WorkspaceEntries
            kind={kind}
            entries={data.entries ?? []}
            scope={scope}
            canEdit={canEdit}
          />
        </Resource>
      )}
      {page.endsWith("/index") && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            {(
              [
                ["indicators", "Registrerede indikatorer"],
                ["actions", "Registrerede handlinger"],
                ["sources", "Registrerede datakilder"],
              ] as const
            ).map(([key, label]) => (
              <Panel key={key} title={label}>
                <Resource name={key} data={data}>
                  <p className="text-2xl">{data[key]?.length}</p>
                </Resource>
              </Panel>
            ))}
          </div>
          <Quality data={data} />
          <Profile data={data} />
          <Links scope={scope} />
        </>
      )}
      {page === "decisions/recommendations" && (
        <Actions data={data} scope={scope} canEdit={canEdit} />
      )}
      {page === "decisions/risk" && (
        <>
          <Panel title="Registrerede miljørisici">
            <Resource name="risks" data={data}>
              {data.risks?.length ? (
                <EnvironmentalRiskTable risks={data.risks} />
              ) : (
                <p>Ingen risici registreret. Risikoniveauet er ukendt.</p>
              )}
            </Resource>
            <Link to="/app/construction">Åbn miljøforhold og afværgetiltag</Link>
          </Panel>
          <Resource name="entries" data={data}>
            <WorkspaceEntries
              kind="stakeholder"
              entries={data.entries ?? []}
              scope={scope}
              canEdit={canEdit}
            />
          </Resource>
        </>
      )}
      {page === "decisions/data-quality" && (
        <>
          <Quality data={data} />
          <Indicators data={data} canEdit={canEdit} />
          <Sources data={data} canEdit={canEdit} />
        </>
      )}
      {page === "decisions/scenarios" && (
        <Panel title="Sammenligning af scenarier">
          <Resource name="entries" data={data}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Scenarie</th>
                    <th>Tidshorisont</th>
                    <th>Fokus</th>
                    <th>Investering</th>
                    <th>Forventet effekt</th>
                    <th>Kilde</th>
                  </tr>
                </thead>
                <tbody>
                  {latestEntries(data.entries ?? [])
                    .filter((e) => e.kind === "scenario")
                    .map((e) => (
                      <tr key={e.id}>
                        <td>{e.title}</td>
                        {["horizon", "focus", "investment", "expectedEffect", "source"].map((k) => (
                          <td key={k}>{e.payload[k] || "Ikke oplyst"}</td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Resource>
        </Panel>
      )}
      {page === "ledger/metrics" && <Indicators data={data} canEdit={canEdit} />}
      {page === "ledger/co2" && (
        <Panel title="Registrerede beregninger">
          <p>
            Viser de gemte værdier med metode og beregningstidspunkt. Ingen fælles nettosum er
            beregnet.
          </p>
          <Resource name="metrics" data={data}>
            {data.metrics?.length ? (
              data.metrics.map((m) => (
                <p key={m.id}>
                  {m.metric_label}: {m.value ?? "Ukendt"} {m.unit} · Metode:{" "}
                  {m.method ?? "Ikke oplyst"} · {m.calculated_at}
                </p>
              ))
            ) : (
              <p>Ingen beregninger registreret.</p>
            )}
          </Resource>
        </Panel>
      )}
      {page === "ledger/sources" && <Sources data={data} canEdit={canEdit} />}
      {page === "ledger/audit" && (
        <Resource name="audit" data={data}>
          <p className="text-sm">Seneste op til 500 registrerede hændelser på projektet.</p>
          <AuditTrailPanel events={data.audit ?? []} projectName={data.project.name} />
        </Resource>
      )}
      {page === "ledger/documents" && <Documents data={data} />}
      {(["ledger/reporting", "impact/reports"] as WorkspacePage[]).includes(page) && (
        <>
          <Documents data={data} />
          <Links scope={scope} />
        </>
      )}
      {(["impact/projects", "impact/portfolio"] as WorkspacePage[]).includes(page) && (
        <Panel title="Organisationens projekter">
          <Resource name="projects" data={data}>
            {data.projects?.map((project) => (
              <article className="border-b py-3" key={project.id}>
                <Link to="/app/projects/$slug" params={{ slug: project.slug ?? project.id }}>
                  {project.name}
                </Link>
                <p>
                  {project.project_type ?? "Type ikke oplyst"} ·{" "}
                  {project.municipality ?? "Kommune ikke oplyst"} ·{" "}
                  {project.status ?? "Status ukendt"}
                </p>
              </article>
            ))}
            <p>
              Effektmål for det valgte projekt findes under Metrics & indikatorer. Forskellige
              enheder summeres ikke.
            </p>
          </Resource>
        </Panel>
      )}
      {page === "impact/project" && (
        <>
          <Profile data={data} />
          <Indicators data={data} canEdit={canEdit} />
          <Links scope={scope} />
        </>
      )}
      {(["impact/verification", "impact/credits"] as WorkspacePage[]).includes(page) && (
        <Panel title="Registrerede effektenheder">
          <Resource name="units" data={data}>
            {data.units?.length ? (
              data.units.map((unit) => (
                <p key={unit.id}>
                  {unit.unit_type}: {unit.quantity ?? "Ukendt"} · {unit.status ?? "Ukendt status"} ·
                  Verifikation: {unit.verification_status ?? "Ukendt"}
                </p>
              ))
            ) : (
              <p>
                Ingen effektenheder registreret. Der er ikke dokumenteret udstedte eller
                verificerede credits.
              </p>
            )}
          </Resource>
          {page === "impact/verification" && <Quality data={data} />}
        </Panel>
      )}
      {page === "decisions/assistant" && <EvidenceAssistant data={data} />}
    </>
  );
}
function Profile({ data }: { data: ProjectWorkspace }) {
  const p = data.project;
  return (
    <Panel title="Projektgrundlag">
      <dl className="grid sm:grid-cols-2 gap-3">
        {[
          ["Type", p.project_type],
          ["Kommune", p.municipality],
          ["Sted", p.location_name],
          ["Status", p.status],
          ["Start", p.start_date],
          ["Slut", p.end_date],
          ["Beskrivelse", p.description],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd>{value ?? "Ikke oplyst"}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
function Quality({ data }: { data: ProjectWorkspace }) {
  return (
    <Panel title="Datakvalitet og begrænsninger">
      <Resource name="quality" data={data}>
        {data.quality?.length ? (
          data.quality.map((q) => (
            <p key={q.id}>
              {q.assessed_at}: {q.overall_score ?? "Ukendt score"} ·{" "}
              {q.explanation ?? "Metode ikke oplyst"}
            </p>
          ))
        ) : (
          <p>Der er ingen registreret kvalitetsvurdering. Datakvaliteten er ukendt.</p>
        )}
      </Resource>
      <Resource name="issues" data={data}>
        {data.issues?.map((i) => (
          <p key={i.id}>
            {i.severity} · {i.status} · {i.description}
          </p>
        ))}
      </Resource>
      <p className="text-sm text-muted-foreground">
        Registreret dokumentation er ikke automatisk faglig godkendelse. GPS-fotopunkter er ikke
        målfast ortofoto.
      </p>
    </Panel>
  );
}
function Indicators({ data, canEdit }: { data: ProjectWorkspace; canEdit: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = data.indicators?.find((i) => i.id === selectedId) ?? null;
  return (
    <Panel title="Projektets indikatorer">
      <Resource name="indicators" data={data}>
        {data.indicators?.length ? (
          data.indicators.map((i) => (
            <div className="border-b py-3 flex justify-between" key={i.id}>
              <div>
                {i.label} · {i.value ?? "Ukendt"} {i.unit}
                <p className="text-xs">
                  {i.key} · {i.updated_at}
                </p>
              </div>
              {
                <Button variant="outline" onClick={() => setSelectedId(i.id)}>
                  Målinger og metode
                </Button>
              }
            </div>
          ))
        ) : (
          <p>Ingen indikatorer registreret. Tilføj projektdata via Smart Connect.</p>
        )}
      </Resource>
      {
        <IndicatorDetail
          readOnly={!canEdit}
          indicator={selected}
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelectedId(null);
          }}
        />
      }
      <Link to="/app/connect/add">Registrér feltdata</Link>
    </Panel>
  );
}
function Sources({ data, canEdit }: { data: ProjectWorkspace; canEdit: boolean }) {
  return (
    <Panel title="Kilder og dataforbindelser">
      <Resource name="sources" data={data}>
        {canEdit && data.sources && data.sites ? (
          <DataSourcesPanel
            projectId={data.project.id}
            sites={data.sites}
            dataSources={data.sources}
          />
        ) : data.sources?.length ? (
          data.sources.map((s) => (
            <p key={s.id}>
              {s.name} · {s.provider ?? "Udbyder ukendt"} · {s.status ?? "Status ukendt"} ·{" "}
              {s.last_sync_at ?? "Ikke synkroniseret"}
            </p>
          ))
        ) : (
          <p>Ingen datakilder registreret.</p>
        )}
      </Resource>
      <Link to="/app/connect/sources">Åbn datakilder</Link>
    </Panel>
  );
}
function Documents({ data }: { data: ProjectWorkspace }) {
  return (
    <Panel title="Dokumenter & bilag">
      <Resource name="documents" data={data}>
        {data.documents?.length ? (
          data.documents.map((d) => (
            <article key={d.id} className="border-b py-3">
              <h3>{d.title}</h3>
              <p>
                {d.document_type} · {d.status} · v{d.version} · {d.created_at}
              </p>
            </article>
          ))
        ) : (
          <p>Ingen genererede dokumenter registreret.</p>
        )}
      </Resource>
      <Resource name="evidence" data={data}>
        {data.evidence?.map((e) => (
          <p key={e.id}>
            {e.title} · {e.evidence_type} · {e.created_at}
          </p>
        ))}
      </Resource>
      <Link to="/app/reports/library">Åbn rapportbibliotek og eksport</Link>
    </Panel>
  );
}
function Links({ scope }: { scope: ProjectScope }) {
  return (
    <div className="flex gap-4 flex-wrap">
      <Link to="/app/reports/new" search={{ project: scope.projectId } as never}>
        Opret rapport på projektet
      </Link>
      <Link to="/app/reports/library" search={{ project: scope.projectId } as never}>
        Rapporter og PDF/ZIP-eksport
      </Link>
      <Link to="/app/connect/map" search={{ project: scope.projectId } as never}>
        Projektkort og datagrundlag
      </Link>
    </div>
  );
}
function Actions({
  data,
  scope,
  canEdit,
}: {
  data: ProjectWorkspace;
  scope: ProjectScope;
  canEdit: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (input: {
      id?: string;
      status?: "I gang" | "Lukket";
      actualImpact?: string;
    }) =>
      input.id
        ? updateProjectAction(scope, input.id, input.status!, input.actualImpact)
        : createProjectAction(scope, title, description),
    onSuccess: async () => {
      setTitle("");
      setDescription("");
      await qc.invalidateQueries({ queryKey: ["project-workspace"] });
    },
  });
  return (
    <Panel title="Projektets anbefalinger og handlinger">
      <Resource name="actions" data={data}>
        {canEdit && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate({});
            }}
          >
            <label className="block">
              Titel
              <input
                className="block border p-2 w-full"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              Beskrivelse
              <textarea
                className="block border p-2 w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <Button disabled={mutation.isPending}>Opret handling</Button>
          </form>
        )}
        {mutation.error && <p role="alert">{mutation.error.message}</p>}
        {!data.actions?.length && <p>Ingen handlinger registreret.</p>}
        {data.actions?.map((action) => (
          <ActionItem
            key={action.id}
            action={action}
            canEdit={canEdit}
            onStart={
              canEdit && !mutation.isPending
                ? (id) => mutation.mutate({ id, status: "I gang" })
                : undefined
            }
            onComplete={
              canEdit && !mutation.isPending
                ? (id, actualImpact) => mutation.mutate({ id, status: "Lukket", actualImpact })
                : undefined
            }
          />
        ))}
      </Resource>
    </Panel>
  );
}
function EvidenceAssistant({ data }: { data: ProjectWorkspace }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  return (
    <Panel title="Assistent — projektets datagrundlag">
      <p>
        Svarene nedenfor er en regelbaseret gennemgang af de indlæste projektregistreringer. Faglige
        AI-udkast med kildehenvisninger laves i rapporteditoren ud fra en gemt og gennemgået
        rapportversion.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const q = question.toLowerCase();
          setAnswer(
            q.includes("ris")
              ? data.errors.risks
                ? "Risici kunne ikke indlæses; vurderingen er ukendt."
                : data.risks?.length
                  ? data.risks
                      .map(
                        (r) =>
                          `${r.title}: ${r.severity ?? "alvor ukendt"} (${r.status ?? "status ukendt"}) [environmental_risks:${r.id}]`,
                      )
                      .join("\n")
                  : "Ingen risici er registreret. Det dokumenterer ikke et lavt risikoniveau."
              : q.includes("handling") || q.includes("næste")
                ? data.errors.actions
                  ? "Handlinger kunne ikke indlæses."
                  : data.actions?.length
                    ? data.actions
                        .map((a) => `${a.title}: ${a.status ?? "status ukendt"} [actions:${a.id}]`)
                        .join("\n")
                    : "Ingen handlinger registreret. Opret en konkret handling under Anbefalinger."
                : `Projekt: ${data.project.name} [projects:${data.project.id}]. ${data.errors.indicators ? "Indikatorer kunne ikke indlæses." : `${data.indicators?.length ?? 0} indikatorer registreret.`} ${data.errors.sources ? "Kilder kunne ikke indlæses." : `${data.sources?.length ?? 0} datakilder registreret.`} Åbn Metode & datakvalitet for begrænsninger og rapporteditoren for kildebaseret AI-redigering.`,
          );
        }}
      >
        <label className="block">
          Spørgsmål
          <input
            className="block w-full border p-2"
            required
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <Button>Gennemgå projektdata</Button>
      </form>
      {answer && (
        <p role="status" className="whitespace-pre-wrap">
          {answer}
        </p>
      )}
      <Link to="/app/reports/library">Åbn kildebaseret rapportassistent</Link>
    </Panel>
  );
}
