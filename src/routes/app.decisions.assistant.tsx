import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card, CardHeader, PageHeader } from "@/components/ui-bits";
import { ConfidenceScore } from "@/components/decisions/Primitives";
import { SUGGESTED_PROMPTS, SAMPLE_ASSISTANT_REPLIES } from "@/lib/decisions-data";
import { getCurrentProject, useAuth } from "@/lib/auth";
import {
  Sparkles,
  Send,
  ShieldAlert,
  Database,
  Clock,
  FileCheck2,
  MessageSquare,
} from "lucide-react";

export const Route = createFileRoute("/app/decisions/assistant")({
  head: () => ({ meta: [{ title: "AI-assistent — DecisionsIQ" }] }),
  component: Page,
});

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; reply: (typeof SAMPLE_ASSISTANT_REPLIES)["default"] };

function pickReply(text: string) {
  const t = text.toLowerCase();
  if (t.includes("risic") || t.includes("risik")) return SAMPLE_ASSISTANT_REPLIES["risici"];
  if (t.includes("co₂") || t.includes("co2")) return SAMPLE_ASSISTANT_REPLIES["co2"];
  return SAMPLE_ASSISTANT_REPLIES["default"];
}

function Page() {
  const { orgId, projectId } = useAuth();
  const project = getCurrentProject(orgId, projectId);

  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", reply: SAMPLE_ASSISTANT_REPLIES["default"] },
  ]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { role: "user", text: t },
      { role: "assistant", reply: pickReply(t) },
    ]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <main className="p-6 max-w-[1400px] w-full mx-auto space-y-5">
      <PageHeader
        title="AI-assistent"
        description="Stil spørgsmål til dit projekt — svar baseres kun på tilgængelige, verificerede data."
      />

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
              className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 text-sm font-medium shadow-soft"
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
              <Ctx
                icon={<FileCheck2 className="h-4 w-4" />}
                label="Projekt"
                value={project?.name ?? "—"}
              />
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
              <Ctx
                icon={<Clock className="h-4 w-4" />}
                label="Sidst opdateret"
                value="3 min siden"
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
