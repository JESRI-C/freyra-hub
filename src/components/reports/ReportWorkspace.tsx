import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { generateEvidenceReportDraft } from "@/lib/report-draft.functions";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, PageHeader } from "@/components/ui-bits";
import { useAuth } from "@/lib/auth";
import { getMyProjectRole, permissionsFor } from "@/services/project-members-service";
import {
  BASIS_LABELS,
  moveSection,
  newReportContent,
  reportIssues,
  type ReportContent,
  type ReportRevision,
  type ReportStatus,
} from "@/lib/report-document";
import {
  getReportRevisions,
  listReportDocuments,
  loadReportSources,
  loadReviewedReportObservations,
  saveReportDocument,
} from "@/services/report-document-service";
import { buildReportImages, type ReportImage } from "@/services/report-assets";
import { downloadReportFile, type ReportFormat } from "@/lib/report-export";
import {
  getReportTemplate,
  isReportTemplateId,
  REPORT_TEMPLATES,
  type ReportTemplateId,
} from "@/lib/report-templates";

export const reportSearch = (
  search: Record<string, unknown>,
): { report?: string; version?: number; template?: ReportTemplateId } => ({
  report: typeof search.report === "string" ? search.report : undefined,
  version:
    typeof search.version === "number" && Number.isInteger(search.version) && search.version > 0
      ? search.version
      : undefined,
  template: isReportTemplateId(search.template) ? search.template : undefined,
});
type Mode = "list" | "new" | "builder" | "preview" | "readiness" | "approval" | "templates";
const button = "rounded-lg border bg-card px-3 py-2 text-sm disabled:opacity-40";
const field = "w-full rounded-lg border bg-background px-3 py-2 text-sm";
export function ReportWorkspace({ mode }: { mode: Mode }) {
  const { currentOrg, currentProject } = useAuth();
  const search = useRouterState({ select: (s) => s.location.search }) as {
    report?: string;
    version?: number;
    template?: ReportTemplateId;
  };
  return (
    <ScopedReportWorkspace
      key={`${currentOrg?.id}:${currentProject?.id}:${search.report}:${search.version}:${search.template}:${mode}`}
      mode={mode}
    />
  );
}
function ScopedReportWorkspace({ mode }: { mode: Mode }) {
  const { currentOrg, currentProject, user, session } = useAuth();
  const generateDraft = useServerFn(generateEvidenceReportDraft);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const search = useRouterState({ select: (s) => s.location.search }) as {
    report?: string;
    version?: number;
    template?: ReportTemplateId;
  };
  const orgId = currentOrg?.id,
    projectId = currentProject?.id,
    reportId = search.report;
  const key = ["report-documents", user?.id, orgId, projectId];
  const documents = useQuery({
    queryKey: key,
    queryFn: () => listReportDocuments(orgId!, projectId!),
    enabled: !!orgId && !!projectId,
  });
  const revisions = useQuery({
    queryKey: [...key, reportId],
    queryFn: () => getReportRevisions(orgId!, projectId!, reportId!),
    enabled: !!orgId && !!projectId && !!reportId && mode !== "new",
  });
  const access = useQuery({
    queryKey: ["project-role", user?.id, orgId, projectId],
    queryFn: () => getMyProjectRole(projectId!, user!.id),
    enabled: !!user && !!orgId && !!projectId,
  });
  const canEdit =
    ["owner", "admin"].includes(currentOrg?.role ?? "") ||
    permissionsFor(access.data ?? null).canEdit;
  const revision = revisions.data?.find((r) =>
    search.version ? r.version === search.version : true,
  );
  const [content, setContent] = useState<ReportContent | null>(null);
  const [busy, setBusy] = useState(false);
  const [workflowReviewReason, setWorkflowReviewReason] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [images, setImages] = useState<ReportImage[]>([]);
  const [imagesReady, setImagesReady] = useState(false);
  const [assetRevisionId, setAssetRevisionId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  useEffect(() => {
    const urls = images.map((image) =>
      URL.createObjectURL(
        new Blob([image.bytes.slice().buffer], { type: `image/${image.format}` }),
      ),
    );
    setImageUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [images]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const draftSeed = useRef<string | null>(null);
  useEffect(() => {
    const seed =
      mode === "new" && currentOrg && currentProject
        ? `new:${orgId}:${projectId}:${search.template ?? "watercourse"}`
        : revision?.id;
    // Auth refreshes recreate org/project objects; saved revisions are immutable.
    // Rehydrate only a different scope/revision, never an in-progress draft.
    if (!seed || draftSeed.current === seed) return;
    draftSeed.current = seed;
    setContent(
      mode === "new" && currentOrg && currentProject
        ? newReportContent(
            currentProject.name,
            currentOrg.name,
            getReportTemplate(search.template).scope,
            "Kunde",
            search.template,
          )
        : (revision?.content ?? null),
    );
    setMessage("");
    setError("");
    setImages([]);
    setImagesReady(false);
  }, [mode, orgId, projectId, reportId, revision, currentOrg, currentProject, search.template]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Handlingen mislykkedes.");
    } finally {
      setBusy(false);
    }
  }
  async function save(status: ReportStatus) {
    if (!canEdit) {
      setError("Din adgang er læseadgang. Rapportversioner kan ikke oprettes eller ændres.");
      return;
    }
    if (!content || !orgId || !projectId) return;
    await run(async () => {
      const saved = await saveReportDocument({
        organizationId: orgId,
        projectId,
        reportId: mode === "new" ? null : (reportId ?? null),
        expectedVersion: mode === "new" ? 0 : (revision?.version ?? 0),
        status,
        content,
      });
      await qc.invalidateQueries({ queryKey: key });
      await navigate({
        to: "/app/reports/builder",
        search: { report: saved.report_id, version: saved.version } as never,
      });
      setMessage(`Version ${saved.version} er gemt.`);
    });
  }
  if (!currentOrg || !currentProject)
    return (
      <main className="p-6">
        <PageHeader
          title="Rapporter"
          description="Vælg organisation og projekt i den fælles projektvælger. Rapporter indlæses kun for det valgte projekt."
        />
      </main>
    );
  const title =
    mode === "new"
      ? "Opret rapport"
      : mode === "list"
        ? "Rapportbibliotek"
        : mode === "readiness"
          ? "Rapportklarhed"
          : mode === "approval"
            ? "Godkendelse og eksport"
            : mode === "preview"
              ? "Rapportpreview"
              : mode === "templates"
                ? "Rapportskabelon"
                : "Rapportbygger";
  const issues = content ? reportIssues(content) : [];
  const changed = !!revision && JSON.stringify(content) !== JSON.stringify(revision.content);
  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-4">
      <PageHeader title={title} description={`${currentOrg.name} / ${currentProject.name}`} />
      {!canEdit && (
        <p role="note">
          Din adgang er læseadgang. Du kan åbne og eksportere gemte rapportversioner.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-destructive p-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-lg border p-3 break-all">
          {message}
        </p>
      )}
      {(documents.error || revisions.error) && (
        <p role="alert">{(documents.error ?? revisions.error)?.message}</p>
      )}
      {(mode === "list" || mode === "templates") && (
        <Card className="p-5 space-y-3">
          <p>
            Rapporter bygger på gemte projektkilder og fagligt gennemgåede afsnit. Manglende
            grundlag vises som ukendt.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {REPORT_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-lg border p-3 space-y-2">
                <h2 className="font-semibold">{template.label}</h2>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                {canEdit && (
                  <Link
                    className={button}
                    to="/app/reports/new"
                    search={{ template: template.id } as never}
                  >
                    Opret {template.label.toLowerCase()}
                  </Link>
                )}
              </div>
            ))}
          </div>
          <div className="divide-y">
            {documents.data?.map((d) => (
              <div key={d.id} className="py-3 flex justify-between gap-3">
                <span>Rapport oprettet {new Date(d.created_at).toLocaleString("da-DK")}</span>
                <Link
                  className="text-primary"
                  to="/app/reports/builder"
                  search={{ report: d.id } as never}
                >
                  Åbn {d.id.slice(0, 8)}
                </Link>
              </div>
            ))}
          </div>
          {documents.isLoading ? (
            <p>Indlæser rapporter…</p>
          ) : documents.data?.length === 0 ? (
            <p>Der er endnu ingen gemte rapporter for projektet.</p>
          ) : null}
        </Card>
      )}
      {!["list", "templates", "new"].includes(mode) && !reportId && (
        <Card className="p-5">
          <p>Vælg en gemt rapport fra biblioteket.</p>
          <Link to="/app/reports/library" className="text-primary">
            Åbn rapportbibliotek
          </Link>
        </Card>
      )}
      {reportId && revision && (
        <Card className="p-4 space-y-2">
          <div className="flex flex-wrap gap-3 items-center">
            <strong>
              Version {revision.version} ·{" "}
              {revision.status === "approved"
                ? "Godkendt"
                : revision.status === "review"
                  ? "Afventer gennemgang"
                  : "Kladde"}
            </strong>
            <select
              aria-label="Rapportversion"
              value={revision.version}
              className={button}
              onChange={(e) =>
                void navigate({
                  to: ".",
                  search: { report: reportId, version: Number(e.target.value) } as never,
                })
              }
            >
              {revisions.data?.map((r) => (
                <option key={r.id} value={r.version}>
                  Version {r.version} · {new Date(r.created_at).toLocaleString("da-DK")}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Gemte versioner ændres ikke. En ændring gemmes som en ny version. Registreret af{" "}
            {revision.created_by}.
          </p>
        </Card>
      )}
      {canEdit && content && (mode === "new" || mode === "builder") && (
        <>
          <Card className="p-5 space-y-3">
            <label className="block">
              Titel
              <input
                className={field}
                value={content.title}
                onChange={(e) => setContent({ ...content, title: e.target.value })}
              />
            </label>
            <label className="block">
              Scope
              <textarea
                className={field}
                value={content.scope}
                onChange={(e) => setContent({ ...content, scope: e.target.value })}
              />
            </label>
            <label className="block">
              Målgruppe
              <input
                className={field}
                value={content.audience}
                onChange={(e) => setContent({ ...content, audience: e.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} className={button} onClick={() => void save("draft")}>
                Gem kladde som ny version
              </button>
              <button
                disabled={busy}
                className={button}
                onClick={() =>
                  void run(async () => {
                    const sources = await loadReportSources(projectId!);
                    setContent((current) =>
                      current
                        ? {
                            ...current,
                            sources,
                            sections: current.sections.map((s) => ({ ...s, reviewed: false })),
                          }
                        : current,
                    );
                    setMessage(
                      `${sources.length} kildereferencer indlæst. Gem versionen for at fastholde dem.`,
                    );
                  })
                }
              >
                Indlæs projektets kilderegister
              </button>
              <button
                className={button}
                disabled={busy || !content.sections.some((section) => section.sourceIds.length)}
                onClick={() => {
                  const used = new Set(content.sections.flatMap((section) => section.sourceIds));
                  setContent({
                    ...content,
                    sources: content.sources.filter((source) => used.has(source.id)),
                  });
                  setMessage("Registeret er afgrænset til afsnittenes kilder. Gem som ny version.");
                }}
              >
                Afgræns register til citerede kilder
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={busy || !content.sections.some((section) => section.id === "section-4")}
                onClick={() =>
                  void run(async () => {
                    const observations = await loadReviewedReportObservations(projectId!, orgId!);
                    const sources = await loadReportSources(projectId!);
                    setContent({
                      ...content,
                      sources,
                      sections: content.sections.map((section) =>
                        section.id === "section-4"
                          ? {
                              ...section,
                              text: observations.map((o) => o.text).join("\n\n"),
                              sourceIds: [...new Set(observations.flatMap((o) => o.sourceIds))],
                              basis: "observed",
                              reviewed: false,
                            }
                          : section,
                      ),
                    });
                    setMessage(
                      `${observations.length} godkendte observationer indlæst. Gennemgå afsnittet og gem versionen.`,
                    );
                  })
                }
              >
                Indlæs godkendte observationer
              </button>
              <button
                className={button}
                disabled={busy || !revision || changed || !session}
                onClick={() =>
                  void run(async () => {
                    if (!revision || !session) return;
                    const result = await generateDraft({
                      data: {
                        accessToken: session.access_token,
                        organizationId: orgId!,
                        projectId: projectId!,
                        reportId: revision.report_id,
                        revisionId: revision.id,
                      },
                    });
                    if (result.error || !result.draft) {
                      const errors: Record<string, string> = {
                        missing_key: "LOVABLE_API_KEY mangler på serveren.",
                        unauthorized: "Adgang til rapportversionen kunne ikke bekræftes.",
                        missing_reviewed_evidence:
                          "Gem først fagligt gennemgåede afsnit med kilder.",
                        missing_evidence: "Rapportversionen mangler kilder.",
                        missing_database: "Serverens databasekonfiguration mangler.",
                      };
                      throw new Error(
                        errors[result.error ?? ""] ??
                          "AI-udkastet kunne ikke valideres eller genereres.",
                      );
                    }
                    const draft = result.draft;
                    setContent({
                      ...content,
                      sections: content.sections.map((section) =>
                        section.id === "section-1"
                          ? {
                              ...section,
                              text: draft.claims
                                .map((c) => `${c.text} [${c.sourceIds.join(", ")}]`)
                                .join("\n\n"),
                              sourceIds: [...new Set(draft.claims.flatMap((c) => c.sourceIds))],
                              reviewed: false,
                              basis: "screening",
                            }
                          : section.id === "section-10"
                            ? {
                                ...section,
                                text: section.text + "\n\n" + draft.limitations.join("\n"),
                                reviewed: false,
                              }
                            : section,
                      ),
                    });
                    setMessage(
                      "AI-forslag er indsat som screening og kræver faglig gennemgang. Gem som ny version.",
                    );
                  })
                }
              >
                Generér kildebaseret tekstforslag
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              AI bruger kun den gemte rapports gennemgåede, kildehenviste tekst via den eksisterende
              serverintegration. Billeder analyseres ikke af dette tekstjob. Nye forslag er altid
              ugodkendte.
            </p>
          </Card>
          {content.sections.map((s, i) => (
            <Card key={s.id} className="p-5 space-y-2">
              <div className="flex justify-between gap-2">
                <h2 className="font-semibold">{s.title}</h2>
                <div>
                  <button
                    aria-label={`Flyt ${s.title} op`}
                    className={button}
                    disabled={i === 0}
                    onClick={() =>
                      setContent({ ...content, sections: moveSection(content.sections, i, i - 1) })
                    }
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`Flyt ${s.title} ned`}
                    className={button}
                    disabled={i === content.sections.length - 1}
                    onClick={() =>
                      setContent({ ...content, sections: moveSection(content.sections, i, i + 1) })
                    }
                  >
                    ↓
                  </button>
                </div>
              </div>
              <textarea
                aria-label={s.title}
                rows={5}
                className={field}
                value={s.text}
                onChange={(e) =>
                  setContent({
                    ...content,
                    sections: content.sections.map((x) =>
                      x.id === s.id ? { ...x, text: e.target.value, reviewed: false } : x,
                    ),
                  })
                }
              />
              <select
                aria-label={`Grundlag for ${s.title}`}
                className={field}
                value={s.basis}
                onChange={(e) =>
                  setContent({
                    ...content,
                    sections: content.sections.map((x) =>
                      x.id === s.id
                        ? { ...x, basis: e.target.value as typeof s.basis, reviewed: false }
                        : x,
                    ),
                  })
                }
              >
                {Object.entries(BASIS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <fieldset>
                <legend className="text-sm">
                  Kilder til afsnittet ({s.sourceIds.length} valgt)
                </legend>
                <input
                  className={field}
                  aria-label="Søg kilder"
                  placeholder="Søg foto eller kilde-id"
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Viser højst 100 match ad gangen. Alle {content.sources.length} kilder er i
                  rapportens gemte register.
                </p>
                {content.sources
                  .filter((source) =>
                    `${source.title} ${source.id}`
                      .toLowerCase()
                      .includes(sourceFilter.toLowerCase()),
                  )
                  .slice(0, 100)
                  .map((source) => (
                    <label key={source.id} className="flex gap-2 text-sm py-1">
                      <input
                        type="checkbox"
                        checked={s.sourceIds.includes(source.id)}
                        onChange={(e) =>
                          setContent({
                            ...content,
                            sections: content.sections.map((x) =>
                              x.id === s.id
                                ? {
                                    ...x,
                                    reviewed: false,
                                    sourceIds: e.target.checked
                                      ? [...x.sourceIds, source.id]
                                      : x.sourceIds.filter((id) => id !== source.id),
                                  }
                                : x,
                            ),
                          })
                        }
                      />
                      {source.title} ({source.id})
                    </label>
                  ))}
              </fieldset>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={s.reviewed}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      sections: content.sections.map((x) =>
                        x.id === s.id ? { ...x, reviewed: e.target.checked } : x,
                      ),
                    })
                  }
                />
                Jeg har fagligt gennemgået afsnittet og dets kildehenvisninger
              </label>
            </Card>
          ))}
        </>
      )}
      {content && (mode === "readiness" || mode === "approval") && (
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">
            {issues.length
              ? "Rapporten er ikke klar til kundegodkendelse"
              : "Datakontrol gennemført - faglig godkendelse kræves"}
          </h2>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
          {canEdit && mode === "approval" && content.workflowSnapshot && (
            <div className="space-y-2">
              <label className="block text-sm">
                Dokumentationsreviewets omfang og begrundelse
                <textarea
                  className={field}
                  value={workflowReviewReason}
                  maxLength={3000}
                  onChange={(event) => setWorkflowReviewReason(event.target.value)}
                />
              </label>
              <button
                className={button}
                disabled={busy || !workflowReviewReason.trim()}
                onClick={() =>
                  setContent({
                    ...content,
                    workflowSnapshot: {
                      ...content.workflowSnapshot!,
                      review: {
                        scope: "documentation",
                        decision: "accepted",
                        inputIds: content.workflowSnapshot!.inputs.map((entry) => entry.id),
                        sectionTexts: Object.fromEntries(
                          content.sections.map((section) => [section.id, section.text]),
                        ),
                        reason: workflowReviewReason.trim(),
                      },
                    },
                  })
                }
              >
                Registrér mit review af disse input og rapporttekster
              </button>
              <p className="text-xs">
                Reviewet verificerer dokumentationen i det angivne omfang. Det godkender ikke en
                kvantitativ natureffekt eller en myndighedsafgørelse. Gem reviewet som ny version
                før godkendelse.
              </p>
            </div>
          )}
          {canEdit && mode === "approval" && (
            <div className="flex gap-2">
              <button
                className={button}
                disabled={busy || changed}
                onClick={() => void save("review")}
              >
                Registrér til gennemgang
              </button>
              <button
                className={button}
                disabled={busy || changed || issues.length > 0}
                onClick={() => void save("approved")}
              >
                Godkend som ny version
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            En gennemgang registreres i systemet. Der sendes ingen mail eller invitation.
          </p>
        </Card>
      )}
      {content && mode === "preview" && <ReportPreview revision={revision} content={content} />}
      {revision && (mode === "approval" || mode === "preview") && (
        <Card className="p-5 space-y-3">
          <h2 className="font-semibold">Eksportér gemt version {revision.version}</h2>
          {revision.content.workflowSnapshot && (
            <button
              className={button}
              disabled={busy || changed}
              onClick={() =>
                void run(async () => {
                  const { buildWorkflowReportPackage } =
                    await import("@/lib/workflow-report-package");
                  const bytes = await buildWorkflowReportPackage(
                    revision,
                    imagesReady ? images : [],
                  );
                  const url = URL.createObjectURL(
                    new Blob([bytes.slice().buffer], { type: "application/zip" }),
                  );
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = "Freyra-foer-efter-v" + revision.version + ".zip";
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 10000);
                })
              }
            >
              Hent PDF og kildepakke fra denne version
            </button>
          )}
          <p className="text-sm">
            Kladder mærkes tydeligt. Filen genereres fra den valgte gemte version og får en
            SHA-256-checksum. Fotoatlas medtager JPEG/PNG-originaler med verificeret checksum. Andre
            formater medtages kun som referencer. Oversigtskortet bruger OpenStreetMap. Hvis
            kortfelter ikke kan hentes, vises det tydeligt i kortbilaget. Faktisk fotodækning og
            officielle naturbindinger er ikke dokumenteret af GPS-punkterne.
          </p>
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setImagesReady(false);
                const next = await buildReportImages(revision);
                setImages(next);
                setAssetRevisionId(revision.id);
                setImagesReady(true);
                setMessage(
                  "Kort- og fotovisning er klar. PDF/DOCX genbruger denne visning uden at hente nye kortfelter.",
                );
              })
            }
          >
            Vis kort og fotoatlas før PDF/DOCX-eksport
          </button>
          {assetRevisionId === revision.id &&
            imageUrls.map((url, i) => (
              <figure key={images[i]?.id} className="border rounded-lg p-3">
                <img src={url} alt={images[i]?.caption} className="max-h-[520px] mx-auto" />
                <figcaption className="text-xs mt-2">{images[i]?.caption}</figcaption>
              </figure>
            ))}
          <div className="flex flex-wrap gap-2">
            {(["pdf", "docx", "csv", "geojson"] as ReportFormat[]).map((format) => (
              <button
                key={format}
                className={button}
                disabled={
                  busy ||
                  ((format === "pdf" || format === "docx") &&
                    (!imagesReady || assetRevisionId !== revision.id))
                }
                onClick={() =>
                  void run(async () => {
                    const file = await downloadReportFile(revision, format, images);
                    setMessage(
                      `Fil genereret og download startet: ${file.filename}. SHA-256: ${file.checksum}`,
                    );
                  })
                }
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}
function ReportPreview({
  content,
  revision,
}: {
  content: ReportContent;
  revision?: ReportRevision;
}) {
  return (
    <Card className="p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <div className="text-primary font-bold">FREYRA</div>
        <h1 className="text-2xl font-semibold mt-3">{content.title}</h1>
        <p>{content.organizationName}</p>
        <p>
          {revision?.status === "approved" ? "Godkendt" : "KLADDE - ikke godkendt"} · Version{" "}
          {revision?.version ?? "ikke gemt"}
        </p>
        <p>Scope: {content.scope}</p>
      </header>
      {content.sections.map((s) => (
        <section key={s.id}>
          <h2 className="font-semibold text-lg">{s.title}</h2>
          <p className="text-xs text-muted-foreground">{BASIS_LABELS[s.basis]}</p>
          <p className="whitespace-pre-wrap mt-2">{s.text || "Grundlaget er ikke dokumenteret."}</p>
          <p className="text-xs mt-2">Kilder: {s.sourceIds.join(", ") || "Ingen"}</p>
        </section>
      ))}
      <section>
        <h2 className="font-semibold text-lg">Kilderegister</h2>
        {content.sources.map((s) => (
          <p key={s.id} className="text-sm mt-2">
            {s.id}: {s.title} · {s.method} · version {s.version} · GPS{" "}
            {s.position?.join(", ") ?? "mangler"} · SHA-256 {s.checksum ?? "ikke dokumenteret"}
          </p>
        ))}
      </section>
    </Card>
  );
}
