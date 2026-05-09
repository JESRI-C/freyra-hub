import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui-bits";
import { ConfidenceScore } from "@/components/decisions/Primitives";
import { getCurrentProject, useAuth } from "@/lib/auth";
import { Sparkles, Send, ShieldAlert, Database, Clock, FileCheck2, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/app/decisions/assistant")({
  head: () => ({ meta: [{ title: "AI-assistent — DecisionsIQ" }] }),
  component: Page,
});

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

// ─── Rule-based response engine ──────────────────────────────────────────────

const RULES: Array<{ keywords: string[]; response: string }> = [
  {
    keywords: ["ndvi", "vegetation", "grøn"],
    response:
      "NDVI-indekset for projektområdet ligger på 0.71, hvilket er 12% over baseline fra 2023. Det indikerer en positiv vegetationsudvikling. Jeg anbefaler at sammenligne med naboliggende arealer for at kontrollere for sæsonudsving.",
  },
  {
    keywords: ["nedbør", "regn", "vand", "hydrologi"],
    response:
      "De seneste 30 dages nedbørsdata fra DMI viser 42 mm — 8% under normalen for perioden. Vandstanden i det tilknyttede målepunkt er stabil. Der er ingen umiddelbar risiko for oversvømmelse, men jeg anbefaler fortsat overvågning i Q3.",
  },
  {
    keywords: ["co2", "kulstof", "carbon", "emission"],
    response:
      "Det aktuelle CO₂-regnskab viser en netto-sekvstrering på 14,2 tCO₂e for indeværende periode. Projektet er på sporet til at opfylde det planlagte mål på 18 tCO₂e ved årets udgang. Usikkerheden i beregningen er ±8%.",
  },
  {
    keywords: ["biodiversitet", "arter", "fauna", "flora"],
    response:
      "Seneste feltregistrering dokumenterer 23 plantearter og 8 fuglearter i projektområdet. Shannon-diversitetsindekset er 2.4, en stigning fra 1.9 ved projektstart. Jeg anbefaler en ny eDNA-analyse i september for at validere data.",
  },
  {
    keywords: ["risiko", "risikovurdering"],
    response:
      "Aktuel risikovurdering identificerer 2 primære risici: (1) Tørkeperioder med lav sandsynlighed men høj konsekvens — mitigeret via vandretention. (2) Invasive arter med middel sandsynlighed — kræver halvårlig overvågning. Samlet risikoniveau: Middel.",
  },
  {
    keywords: ["rapport", "rapportering", "dokumentation"],
    response:
      "Rapporten for Q2 2026 har en samlet readiness-score på 76%. Manglende elementer: feltdokumentation for zone B (deadline 15. juni) og verificeret arealmåling. Jeg anbefaler at prioritere feltdokumentation denne uge.",
  },
  {
    keywords: ["anbefaling", "hvad skal", "næste skridt"],
    response:
      "Baseret på aktuel projektdata anbefaler jeg: (1) Upload feltfotos fra zone A senest fredag — det øger rapportscoren med 8%. (2) Igangsæt NDVI-analyse for Q2-perioden. (3) Koordiner med kommunen om den planlagte statusgennemgang i uge 24.",
  },
];

const DEFAULT_RESPONSE =
  "Jeg har analyseret dit spørgsmål i forhold til projektdataene, men har ikke nok specifikke data til at give et præcist svar. Prøv at specificere hvilket aspekt du ønsker belyst — f.eks. vegetation, vandbalance, CO₂-sekvstrering eller biodiversitet.";

function pickResponse(text: string): string {
  const lower = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.response;
    }
  }
  return DEFAULT_RESPONSE;
}

// ─── Suggested questions ─────────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  "Hvad er NDVI-status for projektområdet?",
  "Er projektet på sporet til CO₂-målet?",
  "Hvilke risici skal vi håndtere nu?",
  "Hvad er næste anbefalede skridt?",
];

// ─── Greeting message ─────────────────────────────────────────────────────────

const GREETING: Message = {
  role: "assistant",
  content:
    "Hej! Jeg er din AI-assistent til projektet. Jeg kan besvare spørgsmål om vegetation, vandbalance, CO₂-regnskab, biodiversitet, risici og rapportering — baseret på projektets aktuelle data. Hvad vil du gerne vide?",
  timestamp: new Date(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Page() {
  const { orgId, projectId } = useAuth();
  const project = getCurrentProject(orgId, projectId);

  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change or typing indicator appears
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || typing) return;

    const userMsg: Message = { role: "user", content: t, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    const delay = 1000 + Math.random() * 1000; // 1–2 s
    setTimeout(() => {
      const assistantMsg: Message = {
        role: "assistant",
        content: pickResponse(t),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setTyping(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }, delay);
  };

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="AI-assistent"
        description="Stil spørgsmål til dit projekt — svar baseres kun på tilgængelige, verificerede data."
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <Card className="flex flex-col h-[620px]">
          {/* Chat header */}
          <div className="px-5 py-3 border-b flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <div className="text-sm font-medium">Samtale</div>
          </div>

          {/* Suggested questions */}
          <div className="px-5 pt-3 pb-2 border-b bg-muted/30">
            <div className="text-xs text-muted-foreground mb-2">Foreslåede spørgsmål</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    inputRef.current?.focus();
                  }}
                  className="text-xs rounded-full border bg-card px-3 py-1.5 hover:bg-accent transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[80%]">
                    <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 text-right pr-1">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-leaf/20 text-primary grid place-items-center shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-tl-sm bg-muted/60 border px-4 py-3 text-sm leading-relaxed">
                      {msg.content}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 pl-1">
                      {formatTime(msg.timestamp)}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Typing indicator */}
            {typing && (
              <div className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-leaf/20 text-primary grid place-items-center shrink-0">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-muted/60 border px-4 py-3 flex items-center gap-1.5">
                  <TypingDots />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
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
              disabled={typing}
              className="flex-1 rounded-xl border bg-card px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || typing}
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium shadow-soft disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" /> Send
            </button>
          </form>
        </Card>

        {/* Context panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Kontekst" subtitle="Det assistenten anvender" />
            <ul className="px-5 pb-5 space-y-3 text-sm">
              <Ctx icon={<FileCheck2 className="h-4 w-4" />} label="Projekt" value={project?.name ?? "—"} />
              <Ctx icon={<Clock className="h-4 w-4" />} label="Periode" value="Sidste 30 dage" />
              <Ctx
                icon={<Database className="h-4 w-4" />}
                label="Forbundne kilder"
                value="Sensorer, Sentinel-2, Felt, ESG ledger"
              />
              <Ctx
                icon={<Sparkles className="h-4 w-4" />}
                label="Datakonfidens"
                value={<ConfidenceScore value={0.82} size="sm" />}
              />
              <Ctx icon={<Clock className="h-4 w-4" />} label="Sidst opdateret" value="3 min siden" />
            </ul>
          </Card>

          <Card className="p-4">
            <div className="flex gap-3">
              <ShieldAlert className="h-4 w-4 text-warning-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                AI-assistenten bruger projektets tilgængelige data og bør anvendes som beslutningsstøtte, ikke som
                endelig verifikation. Verificeret dokumentation sker via ESG Ledger.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}

// ─── Typing dots animation ────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="flex items-center gap-1" aria-label="Analyserer…">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.8s" }}
        />
      ))}
    </span>
  );
}

// ─── Ctx helper ──────────────────────────────────────────────────────────────

function Ctx({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <div className="h-8 w-8 rounded-lg bg-muted text-muted-foreground grid place-items-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </li>
  );
}
