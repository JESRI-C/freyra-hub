import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Database,
  Eye,
  FileDown,
  Leaf,
  LockKeyhole,
} from "lucide-react";
import { getAuditEventsByProject } from "@/services/audit-service";
import { getMyProjectRole, permissionsFor } from "@/services/project-members-service";
import { useAuth } from "@/lib/auth";
import type { Project } from "@/lib/supabase/types";
import { getSurveyRoundAccess } from "@/lib/survey-round.functions";
import { countCanonicalProjectOriginals } from "@/services/project-media-service";
import { listProjectBaselines } from "@/lib/public-baseline.functions";
import { validateProjectPolygon } from "@/services/geo-service";
import { DroneSurveyWorkspace } from "./DroneSurveyWorkspace";
import { PublicBaselinePanel } from "./PublicBaselinePanel";
import { MunicipalReportPanel } from "@/components/reports/MunicipalReportPanel";
import { PlantingSuitabilityPanel } from "@/components/lavbund/PlantingSuitabilityPanel";
import { AuditTrailPanel } from "@/components/audit/AuditTrailPanel";
import { ProjectMembersPanel } from "./ProjectMembersPanel";

export const MUNICIPAL_STEPS = [
  {
    id: "billeder",
    label: "Billeder",
    icon: Camera,
    title: "Begynd med det, I har set i felten",
    description:
      "Upload originalfotos. Freyra læser position og optagedato fra billederne og hjælper dig med at bekræfte området.",
  },
  {
    id: "datagrundlag",
    label: "Datagrundlag",
    icon: Database,
    title: "Se, hvad de offentlige kilder fortæller",
    description:
      "Hent en dateret kildeversion for området. Hver kilde viser sin dækning, og hvad der stadig mangler.",
  },
  {
    id: "gennemgang",
    label: "Gennemgang",
    icon: Eye,
    title: "Sammenhold kilderne med virkeligheden",
    description:
      "Gennemgå fotopunkterne, læs billedvurderingen og registrér din faglige bekræftelse eller afvisning.",
  },
  {
    id: "beplantning",
    label: "Beplantning",
    icon: Leaf,
    title: "Undersøg mulighederne langs vandløbet",
    description:
      "Se kandidatarealer og begrænsninger i 10 og 20 meters afstand. Skitsen kræver faglig validering.",
  },
  {
    id: "rapport",
    label: "Rapport og aflevering",
    icon: FileDown,
    title: "Saml dokumentationen til kommunen",
    description:
      "Gem en uforanderlig rapportversion og hent PDF, datagrundlag og kontrolsummer i én afleveringspakke.",
  },
] as const;
export type MunicipalStep = (typeof MUNICIPAL_STEPS)[number]["id"];

export function MunicipalCaseWorkspace({
  project,
  step,
  selectedRoundId,
  utility,
  onStep,
  onRound,
}: {
  project: Project;
  step: MunicipalStep;
  selectedRoundId?: string;
  utility?: "audit" | "roller";
  onStep: (step: MunicipalStep) => void;
  onRound: (id: string | undefined) => void;
}) {
  const { user, selectProject, projectId: selectedProjectId } = useAuth();
  useEffect(() => {
    if (selectedProjectId !== project.id) selectProject(project.id);
  }, [project.id, selectedProjectId, selectProject]);
  const cache = useQueryClient();
  const getAccess = useServerFn(getSurveyRoundAccess);
  const listBaselines = useServerFn(listProjectBaselines);
  const access = useQuery({
    queryKey: ["municipal-case-access", user?.id, project.id],
    queryFn: () => getAccess({ data: { projectId: project.id } }),
    enabled: !!user,
    retry: false,
  });
  const media = useQuery({
    queryKey: ["municipal-original-count", user?.id, project.id],
    queryFn: () => countCanonicalProjectOriginals(project.id),
    enabled: !!user,
    retry: false,
  });
  const baselines = useQuery({
    queryKey: ["public-baselines", project.id, user?.id],
    queryFn: () => listBaselines({ data: { projectId: project.id } }),
    enabled: !!user,
    retry: false,
  });
  const audit = useQuery({
    queryKey: ["audit", project.id, user?.id],
    queryFn: () => getAuditEventsByProject(project.id),
    enabled: !!user && utility === "audit",
    retry: false,
  });
  const role = useQuery({
    queryKey: ["project-role", project.id, user?.id],
    queryFn: () => getMyProjectRole(project.id, user!.id),
    enabled: !!user && utility === "roller",
  });
  const index = MUNICIPAL_STEPS.findIndex((item) => item.id === step);
  const current = MUNICIPAL_STEPS[index];
  const hasArea = validateProjectPolygon(project.geometry_polygon).valid;
  const readOnly = access.data?.userId === user?.id && !access.data?.canPersist;
  const photoCount = media.isError ? undefined : media.data;
  const latestBaseline = baselines.data?.[0];
  const missing = [
    ...(photoCount === 0
      ? [
          {
            text: "Originalfotos skal uploades eller åbnes til serverkontrol.",
            step: "billeder" as const,
          },
        ]
      : []),
    ...(!hasArea
      ? [
          {
            text: "Projektområdet skal bekræftes, før områdets kilder kan hentes.",
            step: "datagrundlag" as const,
          },
        ]
      : []),
    ...(baselines.isSuccess && !latestBaseline
      ? [{ text: "Der er endnu ingen gemt offentlig kildeversion.", step: "datagrundlag" as const }]
      : []),
  ];
  return (
    <main className="municipal-case mx-auto max-w-[1500px] space-y-6 p-4 pb-24 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          to="/app/projects"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Alle sager
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/app/projects/$slug"
            params={{ slug: project.slug ?? project.id }}
            search={{ tab: "audit", step, round: selectedRoundId }}
          >
            Revisionsspor
          </Link>
          <Link
            to="/app/projects/$slug"
            params={{ slug: project.slug ?? project.id }}
            search={{ tab: "roller", step, round: selectedRoundId }}
          >
            Adgang til sagen
          </Link>
        </div>
      </div>
      <header className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
              Freyra · Naturdokumentation
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {[project.location_name, project.municipality]
                .filter((v, i, a) => v && a.indexOf(v) === i)
                .join(" · ") || "Område afventer registrering"}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-medium">
            {readOnly && <LockKeyhole className="size-3.5" />}
            {readOnly ? "Kommunal læseadgang" : "Sagens dokumentation"}
          </span>
        </div>
        <nav aria-label="Sagens fem trin" className="mt-6 grid grid-cols-5 gap-1 sm:gap-2">
          {MUNICIPAL_STEPS.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`${i + 1}. ${item.label}`}
                title={item.label}
                aria-current={!utility && step === item.id ? "step" : undefined}
                onClick={() => onStep(item.id)}
                className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${step === item.id && !utility ? "border-primary bg-primary text-primary-foreground" : "border-transparent bg-muted/60 hover:border-border"}`}
              >
                <span className="text-xs opacity-75">{i + 1}</span>
                <Icon className="size-4 shrink-0" />
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </header>
      {utility ? (
        <section className="space-y-4">
          <button onClick={() => onStep(step)} className="text-sm text-primary">
            Tilbage til sagsforløbet
          </button>
          {utility === "audit" ? (
            audit.isError ? (
              <p>Revisionssporet kunne ikke hentes. Prøv igen.</p>
            ) : (
              <AuditTrailPanel events={audit.data ?? []} projectName={project.name} />
            )
          ) : (
            <ProjectMembersPanel
              projectId={project.id}
              currentUserId={user?.id ?? ""}
              permissions={permissionsFor(role.data)}
            />
          )}
        </section>
      ) : (
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <section aria-label={current.label} className="min-w-0 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Trin {index + 1} af 5
              </p>
              <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{current.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                {current.description}
              </p>
            </div>
            {index < 3 && (
              <DroneSurveyWorkspace
                project={project}
                phase={step as "billeder" | "datagrundlag" | "gennemgang"}
                selectedRoundId={selectedRoundId}
                onSelectRound={onRound}
                onOpenDelivery={() => onStep("rapport")}
                photoCount={photoCount}
                onPhotosChanged={() =>
                  cache.invalidateQueries({
                    queryKey: ["municipal-original-count", user?.id, project.id],
                  })
                }
              />
            )}
            {step === "datagrundlag" && (
              <PublicBaselinePanel
                project={project}
                canPersist={
                  access.data?.userId === user?.id &&
                  !!access.data?.canPersist &&
                  !access.isFetching &&
                  !access.isError
                }
              />
            )}
            {step === "beplantning" && (
              <>
                <PlantingSuitabilityPanel projectId={project.id} />
                <Link
                  to="/app/lavbund/$projektId/kort"
                  params={{ projektId: project.id }}
                  className="inline-flex items-center gap-2 text-sm text-primary"
                >
                  Åbn hele kortfanen <ArrowRight className="size-4" />
                </Link>
              </>
            )}
            {step === "rapport" && <MunicipalReportPanel projectId={project.id} />}
          </section>
          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Sagens grundlag</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Kontrollerede originaler</dt>
                  <dd>{photoCount ?? "Afventer"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Projektområde</dt>
                  <dd>{hasArea ? "Gemt" : "Mangler"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Kildeversion</dt>
                  <dd>{latestBaseline ? `v${latestBaseline.version}` : "Afventer"}</dd>
                </div>
              </dl>
              {(media.isError || baselines.isError || access.isError) && (
                <p role="status" className="mt-4 text-sm">
                  De seneste oplysninger kunne ikke hentes. Genindlæs sagen.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5 text-sm">
              <h2 className="font-semibold">Før aflevering</h2>
              {missing.length ? (
                <ul className="mt-3 space-y-3">
                  {missing.map((item) => (
                    <li key={item.text}>
                      <button
                        className="text-left underline decoration-amber-400 underline-offset-4"
                        onClick={() => onStep(item.step)}
                      >
                        {item.text}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 leading-6">
                  Kontrollér kildedækning og faglige vurderinger. Rapporten viser de konkrete
                  mangler for den valgte undersøgelse.
                </p>
              )}
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                At besøge et trin er ikke en godkendelse. En gemt rapportversion bevarer det
                grundlag, den er dannet fra.
              </p>
            </div>
          </aside>
        </div>
      )}
      {!utility && (
        <footer className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t bg-card/95 p-3 backdrop-blur sm:static sm:rounded-xl sm:border sm:p-4">
          <button
            className="rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            disabled={index === 0}
            onClick={() => onStep(MUNICIPAL_STEPS[index - 1].id)}
          >
            Forrige trin
          </button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {index + 1} af 5 · {current.label}
          </span>
          {index < 4 ? (
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => onStep(MUNICIPAL_STEPS[index + 1].id)}
            >
              Videre til {MUNICIPAL_STEPS[index + 1].label.toLowerCase()}
              <ArrowRight className="size-4" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Afleveringspakken dannes ovenfor</span>
          )}
        </footer>
      )}
    </main>
  );
}
