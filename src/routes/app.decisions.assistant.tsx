import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { askDecisionsAssistant } from "@/lib/decisions-assistant.functions";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { ConfidenceScore } from "@/components/decisions/Primitives";
import { SUGGESTED_PROMPTS } from "@/lib/decisions-data";
import { useAuth } from "@/lib/auth";
import { getIndicatorsByProject } from "@/services/indicators-service";
import { getOpenActionsByProject } from "@/services/actions-service";
import { getProjectGeometrySeed } from "@/services/geo-service";
import { getProjectSensors } from "@/services/iot-simulation-service";
import type { Indicator } from "@/lib/supabase/types";
import type { Action } from "@/lib/supabase/types";
import type { IoTSensor } from "@/services/iot-simulation-service";
import {
  Sparkles,
  Send,
  ShieldAlert,
  Database,
  Clock,
  FileCheck2,
  MessageSquare,
  Radio,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/app/decisions/assistant")({
  head: () => ({ meta: [{ title: "AI-assistent — DecisionsIQ" }] }),
  component: Page,
});

// ─── Reply shape ──────────────────────────────────────────────────────────────

interface AssistantReply {
  short: string;
  basis: string[];
  recommendation: string;
  uncertainty: string;
  nextAction: string;
}

type Msg = { role: "user"; text: string } | { role: "assistant"; reply: AssistantReply };

// ─── Context-aware reply builder ──────────────────────────────────────────────

interface ProjectCtx {
  projectName: string;
  indicators: Indicator[];
  actions: Action[];
  sensors: IoTSensor[];
}

function val(indicators: Indicator[], key: string): number | null {
  return indicators.find((i) => i.key === key)?.value ?? null;
}

function buildContextualReply(text: string, ctx: ProjectCtx): AssistantReply {
  const t = text.toLowerCase();
  const { projectName, indicators, actions, sensors } = ctx;

  const openHigh = actions.filter((a) => a.priority === "Høj" && a.status !== "Lukket");
  const openMed = actions.filter((a) => a.priority === "Medium" && a.status !== "Lukket");
  const offlineSensors = sensors.filter((s) => s.status === "offline");
  const lowBatSensors = sensors.filter((s) => s.batteryPercent < 20 && s.status !== "offline");
  const biodiversity = val(indicators, "biodiversity_index");
  const dataQuality = val(indicators, "data_quality") ?? val(indicators, "data_confidence");
  const reportReadiness = val(indicators, "report_readiness");
  const co2 = val(indicators, "co2_sequestration") ?? val(indicators, "co2_reduction");

  // ── Sensor / IoT
  if (t.includes("sensor") || t.includes("iot") || t.includes("feltdata")) {
    const onlineCount = sensors.filter((s) => s.status === "online").length;
    return {
      short:
        offlineSensors.length > 0
          ? `${offlineSensors.length} sensor${offlineSensors.length > 1 ? "er er" : " er"} offline i ${projectName} og sender ikke data.`
          : `Alle ${sensors.length} sensorer er online i ${projectName} med normale aflæsninger.`,
      basis: [
        `${onlineCount}/${sensors.length} sensorer online`,
        `${lowBatSensors.length} med lavt batteri`,
        "IoT feltmålinger (simuleret)",
      ],
      recommendation:
        offlineSensors.length > 0
          ? `Tjek ${offlineSensors.map((s) => s.label).join(", ")} i felten snarest.`
          : lowBatSensors.length > 0
            ? `Udskift batteri i ${lowBatSensors.map((s) => s.label).join(", ")}.`
            : "Sensornetværket er sundt. Fortsæt planlagte kalibreringer.",
      uncertainty: "Simuleret IoT-data — erstat med live feeds via Smart Connect.",
      nextAction: "Åbn Livekort → Feltsensorer for detaljeret sensorstatus.",
    };
  }

  // ── Risici / risiko
  if (t.includes("risic") || t.includes("risik")) {
    const topRisk = openHigh[0];
    return {
      short:
        openHigh.length > 0
          ? `${openHigh.length} høj-prioritet handling${openHigh.length > 1 ? "er kræver" : " kræver"} øjeblikkelig opmærksomhed i ${projectName}.`
          : `Ingen kritiske risici identificeret for ${projectName} — ${openMed.length} medium-prioritet handlinger er åbne.`,
      basis: [
        `${actions.length} åbne handlinger analyseret`,
        offlineSensors.length > 0 ? `${offlineSensors.length} offline sensorer` : "Sensorer OK",
        dataQuality !== null ? `Datakvalitet: ${dataQuality}%` : "Ingen datakvalitetsscore",
      ],
      recommendation: topRisk
        ? `Prioritér "${topRisk.title}"${topRisk.due_date ? ` — frist ${new Date(topRisk.due_date).toLocaleDateString("da-DK")}` : ""}.`
        : "Vedligehold nuværende mitigationsplan og overvåg medium-risici.",
      uncertainty:
        dataQuality !== null && dataQuality < 70
          ? `Konfidens begrænset af datakvalitet på ${dataQuality}%.`
          : "Konfidens høj — datagrundlag er komplet.",
      nextAction: "Åbn Handlinger-tabbet i projektet eller DecisionsIQ → Risikoanalyse.",
    };
  }

  // ── Anbefalinger / prioriter
  if (t.includes("anbefal") || t.includes("prioriter") || t.includes("hvad bør")) {
    const top3 = actions.slice(0, 3);
    return {
      short:
        top3.length > 0
          ? `De ${top3.length} vigtigste handlinger for ${projectName}: ${top3.map((a) => a.title).join("; ")}.`
          : `Ingen åbne handlinger registreret for ${projectName}. Projektet er i god stand.`,
      basis: [
        `${actions.length} handlinger evalueret`,
        biodiversity !== null ? `Biodiversitetsindeks: ${biodiversity}/100` : "Biodiversitet ikke målt",
        reportReadiness !== null ? `Rapportklarhed: ${reportReadiness}%` : "Rapportklarhed ukendt",
      ],
      recommendation:
        top3.length > 0
          ? `Start med "${top3[0].title}" (${top3[0].priority ?? "Ukendt"} prioritet).`
          : "Fokusér på at tilføje nye observationer og opdatere indikatorer.",
      uncertainty: "Prioritering baseres på registrerede handlinger — manuelle vurderinger kan afvige.",
      nextAction: "Gå til Projekter → Handlinger for at opdatere status.",
    };
  }

  // ── Biodiversitet / natur / dokumentation
  if (t.includes("biodiversitet") || t.includes("natur") || t.includes("dokumenter")) {
    const bioVal = biodiversity ?? 0;
    const trend = bioVal > 70 ? "positiv" : bioVal > 50 ? "neutral" : "negativ";
    return {
      short:
        biodiversity !== null
          ? `Biodiversitetsindeks for ${projectName} er ${bioVal}/100 — en ${trend} tilstand.`
          : `Biodiversitetsindeks er endnu ikke målt for ${projectName}.`,
      basis: [
        biodiversity !== null ? `Biodiversitetsindeks: ${bioVal}/100` : "Mangler baseline-måling",
        `${sensors.filter((s) => s.type === "soil_moisture" || s.type === "soil_temperature" || s.type === "air_temperature").length} miljøsensorer aktive`,
        "Feltobservationer og satellitdata",
      ],
      recommendation:
        bioVal < 60
          ? "Igangsæt habitatforbedring og øg observationsdækning i lavtydende zoner."
          : "Fortsæt nuværende forvaltning og dokumentér med regelmæssige feltbesøg.",
      uncertainty:
        biodiversity === null
          ? "Ingen baseline etableret — tal er estimerede."
          : "Konfidens afhænger af observationstæthed.",
      nextAction: "Upload feltfotos som dokumentation via Projekter → Medier.",
    };
  }

  // ── CO₂ / klima / emission
  if (t.includes("co₂") || t.includes("co2") || t.includes("klima") || t.includes("emission")) {
    const co2Val = co2;
    return {
      short:
        co2Val !== null
          ? `${projectName} sekvestrerer/reducerer ${co2Val} enheder CO₂ ifølge aktuelle målinger.`
          : `CO₂-målinger er endnu ikke registreret for ${projectName}.`,
      basis: [
        co2Val !== null ? `CO₂: ${co2Val} enheder` : "Ingen CO₂-data",
        "ESG Ledger Scope-opgørelse",
        "Emissionsfaktor-bibliotek",
      ],
      recommendation:
        co2Val !== null
          ? "Validér beregningsgrundlag og opdatér emissionsfaktorer i ESG Ledger."
          : "Registrér baseline CO₂-data i ESG Ledger for at aktivere klima-tracking.",
      uncertainty: "CO₂-beregninger kræver verifikation af en uafhængig tredjepart.",
      nextAction: "Åbn ESG Ledger → CO₂-regnskab.",
    };
  }

  // ── Datakvalitet / datakilder / svagest
  if (t.includes("datakvalitet") || t.includes("datakilder") || t.includes("svagest") || t.includes("data")) {
    const dq = dataQuality ?? 0;
    return {
      short:
        dataQuality !== null
          ? `Datakvaliteten for ${projectName} er ${dq}% — ${dq >= 80 ? "god" : dq >= 60 ? "acceptabel" : "under target"}.`
          : `Datakvalitet er ikke evalueret for ${projectName} endnu.`,
      basis: [
        dataQuality !== null ? `Datakvalitet: ${dq}%` : "Mangler evaluering",
        `${offlineSensors.length} offline sensorer`,
        `${actions.filter((a) => a.status !== "Lukket").length} uløste handlinger`,
      ],
      recommendation:
        dq < 70
          ? "Kalibrér offline sensorer og valider seneste dataindlæsninger i Smart Connect."
          : "Datakvaliteten er tilstrækkelig. Overvåg løbende via Smart Connect.",
      uncertainty: "Kvalitetsscore er baseret på tilgængelige indikatorer og kan være ufuldstændig.",
      nextAction: "Åbn Smart Connect → Datakvalitet for detaljer.",
    };
  }

  // ── ESG / score / rapport
  if (t.includes("esg") || t.includes("rapport") || t.includes("score") || t.includes("forbedre")) {
    const rr = reportReadiness ?? 0;
    return {
      short:
        reportReadiness !== null
          ? `Rapportklarhed for ${projectName} er ${rr}% — ${rr >= 80 ? "klar til ekstern brug" : rr >= 60 ? "klar til intern brug" : "kræver supplerende dokumentation"}.`
          : `Rapportklarhed er ikke beregnet for ${projectName}.`,
      basis: [
        reportReadiness !== null ? `Rapportklarhed: ${rr}%` : "Ikke beregnet",
        `${actions.filter((a) => a.status !== "Lukket").length} åbne handlinger`,
        biodiversity !== null ? `Biodiversitet: ${biodiversity}/100` : "Biodiversitet ikke målt",
      ],
      recommendation:
        rr < 70
          ? "Fuldfør manglende dokumentation og luk åbne handlinger for at øge ESG-scoren."
          : "Projektet er klar. Igangsæt godkendelsesflow i Rapporter.",
      uncertainty: "Rapportklarhed beregnes dynamisk baseret på registrerede data.",
      nextAction: "Åbn Rapporter → Rapportklarhed eller Projekter → Rapporter.",
    };
  }

  // ── Default: projektoverview
  return {
    short:
      `${projectName} har ${actions.filter((a) => a.status !== "Lukket").length} åbne handlinger` +
      (offlineSensors.length > 0 ? `, ${offlineSensors.length} offline sensor${offlineSensors.length > 1 ? "er" : ""}` : "") +
      (biodiversity !== null ? ` og biodiversitetsindeks på ${biodiversity}/100` : "") +
      ".",
    basis: [
      `${indicators.length} indikatorer evalueret`,
      `${sensors.length} feltSensorer (${sensors.filter((s) => s.status === "online").length} online)`,
      `${actions.length} handlinger analyseret`,
    ],
    recommendation:
      openHigh.length > 0
        ? `Prioritér "${openHigh[0].title}" som første handling.`
        : "Projektet er i god stand. Fokusér på løbende dokumentation.",
    uncertainty:
      dataQuality !== null
        ? `Konfidens begrænset af datakvalitet på ${dataQuality}%.`
        : "Konfidens afhænger af datafuldstændighed.",
    nextAction: "Åbn Projekter → Overblik for det fulde projekt-dashboard.",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { projectId, currentProject: project } = useAuth();
  const activeProjectId = projectId ?? "";

  const { data: indicators = [] } = useQuery({
    queryKey: ["indicators", activeProjectId],
    queryFn: () => getIndicatorsByProject(activeProjectId),
    enabled: !!activeProjectId,
  });

  const { data: actions = [] } = useQuery({
    queryKey: ["actions", activeProjectId],
    queryFn: () => getOpenActionsByProject(activeProjectId),
    enabled: !!activeProjectId,
  });

  const geometry = getProjectGeometrySeed(activeProjectId);
  const sensors = geometry.centroid ? getProjectSensors(activeProjectId, geometry.centroid) : [];

  const ctx: ProjectCtx = {
    projectName: project?.name ?? "projektet",
    indicators: indicators ?? [],
    actions: actions ?? [],
    sensors,
  };

  const onlineSensors = sensors.filter((s) => s.status === "online").length;
  const dataQualityVal =
    (indicators ?? []).find((i) => i.key === "data_quality" || i.key === "data_confidence")
      ?.value ?? null;
  const confidence = dataQualityVal !== null ? dataQualityVal / 100 : 0.75;

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", reply: buildContextualReply("", ctx) },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ask = useServerFn(askDecisionsAssistant);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setMessages((m) => [...m, { role: "user", text: t }]);
    setInput("");
    setPending(true);
    try {
      const res = await ask({
        data: {
          question: t,
          projectName: ctx.projectName,
          indicators: ctx.indicators.map((i) => ({ key: i.key, value: i.value })),
          actions: ctx.actions.map((a) => ({
            title: a.title,
            priority: a.priority,
            status: a.status,
            due_date: a.due_date,
          })),
          sensors: ctx.sensors.map((s) => ({
            label: s.label,
            type: s.type,
            status: s.status,
            batteryPercent: s.batteryPercent,
          })),
        },
      });
      const reply = res.error || !res.reply ? buildContextualReply(t, ctx) : res.reply;
      setMessages((m) => [...m, { role: "assistant", reply }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", reply: buildContextualReply(t, ctx) }]);
    } finally {
      setPending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI-assistent</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stil spørgsmål til{" "}
            <span className="font-medium text-foreground">{project?.name ?? "projektet"}</span> —
            svar baseres kun på tilgængelige, verificerede data.
          </p>
        </div>
        <Pill tone={onlineSensors > 0 ? "success" : "warning"}>
          {onlineSensors}/{sensors.length} sensorer online
        </Pill>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <Card className="flex flex-col h-[620px]">
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">Samtale</div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm">
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-leaf/20 text-primary grid place-items-center shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="max-w-[85%] space-y-2">
                    <div className="rounded-2xl rounded-tl-sm bg-muted/60 border px-4 py-3 text-sm">
                      <div className="font-medium mb-2">Kort svar</div>
                      <p className="leading-relaxed">{m.reply.short}</p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-2 text-xs">
                      <Block label="Datagrundlag" tone="info">
                        <ul className="space-y-1">
                          {m.reply.basis.map((b) => (
                            <li key={b} className="flex gap-1.5">
                              <span className="h-1 w-1 rounded-full bg-leaf mt-1.5" />
                              {b}
                            </li>
                          ))}
                        </ul>
                      </Block>
                      <Block label="Anbefaling" tone="success">
                        {m.reply.recommendation}
                      </Block>
                      <Block label="Usikkerhed" tone="warning">
                        {m.reply.uncertainty}
                      </Block>
                      <Block label="Næste handling" tone="primary">
                        {m.reply.nextAction}
                      </Block>
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {/* Suggestions */}
          <div className="px-5 py-3 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">Foreslåede spørgsmål</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-xs rounded-full border bg-card px-3 py-1.5 hover:bg-accent transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form
            className="p-3 border-t flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv et spørgsmål til projektet…"
              className="flex-1 rounded-xl border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium shadow-soft disabled:opacity-60"
            >
              <Send className="h-4 w-4" /> {pending ? "Tænker…" : "Send"}
            </button>
          </form>
        </Card>

        {/* Context panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Kontekst" subtitle="Det assistenten anvender" />
            <ul className="px-5 pb-5 space-y-3 text-sm">
              <Ctx
                icon={<FileCheck2 className="h-4 w-4" />}
                label="Projekt"
                value={project?.name ?? "—"}
              />
              <Ctx
                icon={<Activity className="h-4 w-4" />}
                label="Åbne handlinger"
                value={`${actions.length} handlinger`}
              />
              <Ctx
                icon={<Radio className="h-4 w-4" />}
                label="Sensorer"
                value={`${onlineSensors}/${sensors.length} online`}
              />
              <Ctx
                icon={<Database className="h-4 w-4" />}
                label="Indikatorer"
                value={`${indicators.length} registrerede`}
              />
              <Ctx
                icon={<Sparkles className="h-4 w-4" />}
                label="Datakonfidens"
                value={<ConfidenceScore value={confidence} size="sm" />}
              />
              <Ctx
                icon={<Clock className="h-4 w-4" />}
                label="Periode"
                value="Sidste 30 dage"
              />
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex gap-3">
              <ShieldAlert className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI-assistenten bruger projektets tilgængelige data og bør anvendes som
                beslutningsstøtte, ikke som endelig verifikation. Verificeret dokumentation sker via
                ESG Ledger.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Block({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone: "info" | "success" | "warning" | "primary";
}) {
  const tones: Record<string, string> = {
    info: "bg-card border",
    success: "bg-success/10 border border-success/20",
    warning: "bg-warning/10 border border-warning/30",
    primary: "bg-leaf/10 border border-leaf/20",
  };
  return (
    <div className={`rounded-xl px-3 py-2.5 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {label}
      </div>
      <div className="mt-1 text-foreground">{children}</div>
    </div>
  );
}

function Ctx({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground grid place-items-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </li>
  );
}
