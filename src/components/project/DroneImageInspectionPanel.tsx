import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui-bits";
import {
  listDroneImageInspections,
  listDroneImageInspectionAnswers,
  saveDroneImageInspectionAnswers,
} from "@/lib/drone-image-inspection.functions";
import { getSurveyRoundMediaAccess } from "@/lib/survey-round-media.functions";
import { getCanonicalDroneMediaUrl } from "@/lib/canonical-drone-media.functions";
import type {
  DroneImageInspectionRecord,
  DroneImageInspectionAnswer,
} from "@/services/monitoring/drone-image-inspection-persistence";

type Props = { projectId: string; actorId?: string; refreshToken?: number };
const assessmentLabels = {
  confirmed: "Bekræftet ved min gennemgang",
  not_confirmed: "Ikke bekræftet ved min gennemgang",
  uncertain: "Kan ikke afgøres endnu",
};
const qualityLabels = {
  usable: "Kan gennemgås",
  limited: "Begrænset udsyn eller billedkvalitet",
  unusable: "Kræver et bedre billede",
};

export function DroneImageInspectionPanel(props: Props) {
  const { user } = useAuth();
  if (!user || (props.actorId && props.actorId !== user.id)) return null;
  return <InspectionList key={`${user.id}:${props.projectId}`} {...props} actorId={user.id} />;
}

function InspectionList({ projectId, actorId, refreshToken }: Props & { actorId: string }) {
  const list = useServerFn(listDroneImageInspections);
  const accessFn = useServerFn(getSurveyRoundMediaAccess);
  const cache = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["drone-image-inspections", actorId, projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => list({ data: { projectId, beforeId: pageParam, limit: 10 } }),
    getNextPageParam: (page) => page.nextBeforeId ?? undefined,
    retry: false,
  });
  const access = useQuery({
    queryKey: ["drone-image-inspection-write-access", actorId, projectId],
    queryFn: () => accessFn({ data: { projectId } }),
    retry: false,
  });
  useEffect(() => {
    if (refreshToken)
      void cache.invalidateQueries({ queryKey: ["drone-image-inspections", actorId, projectId] });
  }, [actorId, projectId, refreshToken, cache]);
  const records = query.error ? [] : (query.data?.pages.flatMap((page) => page.items) ?? []);
  if (query.isLoading)
    return <p className="text-sm text-muted-foreground">Henter gemt billedgennemgang …</p>;
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="font-semibold">Billeder, spørgsmål og rapportgrundlag</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Billed-AI foreslår, hvad der skal undersøges. Dine svar gemmes som nye kladdeversioner med
          henvisning til det præcise billede.
        </p>
      </div>
      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          Billedgennemgangen kunne ikke hentes med din aktuelle adgang.
        </p>
      )}
      {!query.error && records.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Upload dronebilleder under Undersøgelse for at starte. Her samles de gemte billedforslag
          og dine svar.
        </p>
      )}
      {records.map((record, index) => (
        <details className="rounded-lg border p-4" key={record.id} open={records.length === 1}>
          <summary className="cursor-pointer font-medium">
            Foto {index + 1} ·{" "}
            {record.result?.reportSummary.visibleThemes[0] ??
              "Kontrollér billedets udsyn og placering"}
          </summary>
          <InspectionQuestions
            key={`${actorId}:${record.id}:${record.resultSha256}`}
            record={record}
            actorId={actorId}
            canWrite={
              access.data?.userId === actorId &&
              access.data.projectId === projectId &&
              access.data.canAssign &&
              !access.isFetching &&
              !access.error
            }
          />
        </details>
      ))}
      {query.hasNextPage && (
        <button
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Hent flere billedforslag
        </button>
      )}
      {records.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Rapportgrundlaget er en kladde. Billedforslag og egne svar kræver faglig vurdering og en
          afklaret delstrækning før kommunal aflevering. Satellitkataloger er kildehenvisninger; de
          er ikke analyserede satellitbilleder.
        </p>
      )}
    </Card>
  );
}

function InspectionQuestions({
  record,
  actorId,
  canWrite,
}: {
  record: DroneImageInspectionRecord;
  actorId: string;
  canWrite: boolean | undefined;
}) {
  const loadAnswers = useServerFn(listDroneImageInspectionAnswers);
  const saveAnswers = useServerFn(saveDroneImageInspectionAnswers);
  const getOriginal = useServerFn(getCanonicalDroneMediaUrl);
  const cache = useQueryClient();
  const alive = useRef(true);
  const previewExpiry = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(previewExpiry.current);
    };
  }, []);
  const queryKey = ["drone-image-inspection-answers", actorId, record.projectId, record.id];
  const saved = useQuery({
    queryKey,
    queryFn: () => loadAnswers({ data: { projectId: record.projectId, inspectionId: record.id } }),
    retry: false,
    staleTime: 0,
  });
  const latest = saved.data?.items[0];
  const [edits, setEdits] = useState<Record<string, Partial<DroneImageInspectionAnswer>>>({});
  const receipt = useRef<{ requestId: string; text: string } | null>(null);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const preview = useMutation({
    mutationFn: async () => {
      const value = await getOriginal({
        data: { projectId: record.projectId, mediaId: record.mediaId },
      });
      if (!alive.current) return;
      if (
        value.projectId !== record.projectId ||
        value.mediaId !== record.mediaId ||
        value.originalSha256 !== record.originalSha256
      )
        throw new Error("Originalfotoet matcher ikke den gemte billedvurdering.");
      clearTimeout(previewExpiry.current);
      setPreviewUrl(value.signedUrl);
      previewExpiry.current = setTimeout(() => {
        if (alive.current) setPreviewUrl(null);
      }, 55_000);
    },
    retry: false,
  });
  const values = () =>
    record.result!.followupQuestions.flatMap((question) => {
      const answer =
        edits[question.id] ?? latest?.answers.find((item) => item.questionId === question.id);
      if (
        answer &&
        ((answer.assessment && !answer.note?.trim()) ||
          (!answer.assessment && (answer.note?.trim() || answer.followup?.trim())))
      )
        throw new Error(
          "Hvert udfyldt svar skal have både en vurdering og en begrundelse. Ubesvarede spørgsmål kan stå tomme.",
        );
      return answer?.assessment && answer.note?.trim()
        ? [
            {
              questionId: question.id,
              assessment: answer.assessment,
              note: answer.note.trim(),
              followup: answer.followup?.trim() ?? "",
            },
          ]
        : [];
    });
  const save = useMutation({
    mutationFn: async () => {
      if (!canWrite || !record.resultSha256 || saved.isFetching || saved.error)
        throw new Error("Vent på den aktuelle adgang og de gemte svar.");
      const answers = values();
      if (!answers.length)
        throw new Error("Vælg en vurdering og skriv begrundelsen til mindst ét spørgsmål.");
      const text = JSON.stringify(answers);
      if (receipt.current && receipt.current.text !== text && uncertainSave)
        throw new Error(
          "Hent først resultatet af det seneste gemmeforsøg ved at prøve igen med de samme svar.",
        );
      if (!receipt.current || receipt.current.text !== text)
        receipt.current = { requestId: crypto.randomUUID(), text };
      const result = await saveAnswers({
        data: {
          projectId: record.projectId,
          inspectionId: record.id,
          inspectionResultSha256: record.resultSha256,
          expectedCallerUserId: actorId,
          requestId: receipt.current.requestId,
          answers,
        },
      });
      if (!alive.current) return;
      await cache.invalidateQueries({ queryKey });
      if (!alive.current) return;
      setEdits({});
      setUncertainSave(false);
      receipt.current = null;
      setSavedMessage(`Svar gemt som kladdeversion ${result.id.slice(0, 8)}.`);
    },
    onError: () => {
      if (alive.current && receipt.current) setUncertainSave(true);
    },
    retry: false,
  });
  if (!record.result) return null;
  const draft = record.result;
  function download() {
    const answers = latest?.answers ?? [];
    const report = [
      "FOTOGENNEMGANG – RAPPORTGRUNDLAG TIL HADERSLEV KOMMUNE",
      "Status: kladde, afventer faglig gennemgang",
      `Sag: ${record.projectId}`,
      `Billedreference: ${record.mediaId}`,
      `Billedvurdering: ${record.id}`,
      `Original SHA-256: ${record.originalSha256}`,
      `Billed-AI-resultat SHA-256: ${record.resultSha256}`,
      `Model: ${record.modelId}`,
      `Genereret: ${draft.provenance.generatedAt}`,
      `Gemt svarversion: ${latest?.id ?? "Ingen"}`,
      "",
      "FORMÅL",
      "Afklare synlige forhold og nødvendige supplerende undersøgelser. Kommunens præcise delstrækning og rapportens faglige godkendelse er endnu ikke dokumenteret i denne fotogennemgang.",
      "",
      "BILLEDFORSLAG",
      ...draft.reportSummary.visibleThemes,
      `Billedkvalitet: ${qualityLabels[draft.visual.quality.assessment]}`,
      "",
      "SPØRGSMÅL OG GEMTE SVAR",
      ...draft.followupQuestions.flatMap((question) => {
        const answer = answers.find((item) => item.questionId === question.id);
        return [
          question.question,
          answer ? `Egen vurdering: ${assessmentLabels[answer.assessment]}` : "Ubesvaret",
          answer ? `Begrundelse/usikkerhed: ${answer.note}` : "",
          answer?.followup ? `Opfølgning: ${answer.followup}` : "",
          "",
        ];
      }),
      "DATAGRUNDLAG OG BEGRÆNSNINGER",
      ...draft.reportSummary.limitations,
      draft.sourceContext
        ? `Datagrundlag: ${draft.sourceContext.snapshotId}. SHA-256: ${draft.sourceContext.snapshotSha256}. Kildemangler: ${draft.sourceContext.limitations.join("; ") || "Se den gemte kildeversion og dens faglige begrænsninger."}`
        : "Denne fotogennemgang har ingen gemt kobling til en bestemt kildeversion. Sted og offentligt datagrundlag skal afklares særskilt.",
      "Kamerapositionen og et eventuelt søgeområde dokumenterer ikke i sig selv billedets dækningsområde eller den kommunale delstrækning.",
      "Der er ikke udledt længde, areal, vandføring, miljøtilstand eller behov for indgreb fra billedet. Et bekræftet svar er en egen observation, ikke en faglig godkendelse.",
      "",
      "NÆSTE SKRIDT",
      ...draft.reportSummary.nextSteps,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([report], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fotogennemgang-${record.mediaId.slice(0, 8)}-kladde.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const update = (id: string, patch: Partial<DroneImageInspectionAnswer>) => {
    setSavedMessage(null);
    setEdits((previous) => ({
      ...previous,
      [id]: {
        ...(previous[id] ?? latest?.answers.find((answer) => answer.questionId === id)),
        ...patch,
      },
    }));
  };
  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <button
          type="button"
          className="rounded-lg border px-3 py-2 text-sm"
          disabled={preview.isPending}
          onClick={() => preview.mutate()}
        >
          {preview.isPending ? "Henter originalfoto …" : "Vis originalfoto til gennemgang"}
        </button>
        {preview.error && (
          <p role="alert" className="text-sm text-destructive">
            Originalfotoet kunne ikke vises med din aktuelle adgang.
          </p>
        )}
        {previewUrl && (
          <img
            src={previewUrl}
            alt={`Originalfoto til billedvurdering ${record.mediaId.slice(0, 8)}`}
            referrerPolicy="no-referrer"
            className="max-h-[32rem] w-full rounded-lg border object-contain"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Billedreference {record.mediaId.slice(0, 8)}. Originalfotoet vises via en kortvarig privat
          læseadgang.
        </p>
      </div>
      <p className="text-sm">
        {qualityLabels[draft.visual.quality.assessment]} · {draft.visual.quality.limitation}
      </p>
      <p className="text-sm text-muted-foreground">{draft.visual.overallUncertainty}</p>
      <p className="text-xs text-muted-foreground">
        {draft.sourceContext
          ? `Baseret på gemt datagrundlag ${draft.sourceContext.snapshotId.slice(0, 8)}. Kildernes begrænsninger følger billedforslaget.`
          : "Dette ældre billedforslag har endnu ingen gemt kildeversion. Bekræft sted og hent datagrundlaget i undersøgelsen."}
      </p>
      {draft.visual.features.map((feature, index) => (
        <p className="text-sm" key={index}>
          <strong>Muligt synligt træk:</strong> {feature.appearance}{" "}
          <span className="text-muted-foreground">Usikkerhed: {feature.uncertainty}</span>
        </p>
      ))}
      {saved.error && (
        <p role="alert" className="text-sm text-destructive">
          De gemte svar kunne ikke hentes. Genindlæs før du redigerer.
        </p>
      )}
      {draft.followupQuestions.map((question) => {
        const answer =
          edits[question.id] ?? latest?.answers.find((item) => item.questionId === question.id);
        const disabled =
          !canWrite || saved.isFetching || !!saved.error || save.isPending || uncertainSave;
        return (
          <fieldset
            key={question.id}
            disabled={disabled}
            className="space-y-2 rounded-lg border p-3"
          >
            <legend className="px-1 text-sm font-medium">{question.question}</legend>
            <p className="text-xs text-muted-foreground">{question.rationale}</p>
            <select
              aria-label={`Vurdering: ${question.question}`}
              value={answer?.assessment ?? ""}
              onChange={(event) =>
                update(question.id, {
                  assessment: event.target.value as DroneImageInspectionAnswer["assessment"],
                })
              }
              className="w-full rounded border bg-background p-2 text-sm"
            >
              <option value="" disabled>
                Vælg din vurdering
              </option>
              {Object.entries(assessmentLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea
              aria-label={`Begrundelse: ${question.question}`}
              placeholder="Hvad bygger svaret på, og hvad er stadig usikkert?"
              maxLength={2000}
              value={answer?.note ?? ""}
              onChange={(event) => update(question.id, { note: event.target.value })}
              className="min-h-20 w-full rounded border bg-background p-2 text-sm"
            />
            <textarea
              aria-label={`Opfølgning: ${question.question}`}
              placeholder="Evt. næste skridt, fx besigtigelse eller et supplerende nærfoto"
              maxLength={1000}
              value={answer?.followup ?? ""}
              onChange={(event) => update(question.id, { followup: event.target.value })}
              className="w-full rounded border bg-background p-2 text-sm"
            />
          </fieldset>
        );
      })}
      <div className="flex flex-wrap gap-3">
        {canWrite && (
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || saved.isFetching || !!saved.error}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {uncertainSave ? "Kontrollér seneste gemning" : "Gem svar til rapportgrundlaget"}
          </button>
        )}
        <button
          type="button"
          onClick={download}
          disabled={saved.isFetching || !!saved.error || save.isPending}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <FileText className="h-4 w-4" />
          Hent fotogennemgang som tekstkladde
        </button>
      </div>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error instanceof Error ? save.error.message : "Svarene kunne ikke gemmes."}
        </p>
      )}
      {savedMessage && (
        <p role="status" className="text-sm">
          {savedMessage}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {latest
          ? `Seneste svarversion gemt ${new Date(latest.createdAt).toLocaleString("da-DK")}. `
          : "Ingen svar gemt endnu. "}
        Kun gemte svar indgår i tekstkladden. Billedreference {record.mediaId.slice(0, 8)} ·
        AI-forslag er ikke fagligt godkendte fund.
      </p>
    </div>
  );
}
