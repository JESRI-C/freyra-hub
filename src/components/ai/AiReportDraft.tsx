import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, RefreshCw, Copy, Check, AlertTriangle, FileText } from "lucide-react";
import { generateReportDraft, type ReportDraft } from "@/lib/report-draft.functions";

type Props = {
  reportType: string;
  projectName: string;
  audience?: string;
  context: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_key: "Lovable AI er ikke aktiveret i workspacet.",
  rate_limit: "For mange forespørgsler. Prøv igen om lidt.",
  credits: "AI-credits er opbrugt. Tilføj credits under Settings → Workspace → Usage.",
  unknown: "Kunne ikke generere udkast lige nu.",
};

export function AiReportDraft({ reportType, projectName, audience, context }: Props) {
  const fn = useServerFn(generateReportDraft);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fn({ data: { reportType, projectName, audience, context } });
      if (res.error) {
        setError(ERROR_MESSAGES[res.error] ?? ERROR_MESSAGES.unknown);
        setDraft(null);
      } else {
        setDraft(res.draft);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : ERROR_MESSAGES.unknown);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = async () => {
    if (!draft) return;
    const text =
      `${draft.title}\n\n` +
      `RESUMÉ\n${draft.executiveSummary}\n\n` +
      `NØGLEFUND\n${draft.keyFindings.map((f) => `• ${f}`).join("\n")}\n\n` +
      `RISICI\n${draft.risks.map((r) => `• ${r}`).join("\n")}\n\n` +
      `ANBEFALINGER\n${draft.recommendations.map((r) => `• ${r}`).join("\n")}\n\n` +
      `NÆSTE SKRIDT\n${draft.nextSteps.map((s) => `• ${s}`).join("\n")}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-2xl border bg-gradient-to-br from-primary/5 via-leaf/10 to-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 grid place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              AI-rapportudkast
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border text-muted-foreground">
                Gemini
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Generér struktureret udkast — resumé, nøglefund, risici og anbefalinger — direkte fra
              projektets data.
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {draft && (
            <button
              onClick={copyAll}
              className="inline-flex items-center gap-1.5 text-xs rounded-lg border bg-card px-3 py-1.5 hover:bg-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Kopieret" : "Kopiér"}
            </button>
          )}
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs rounded-lg bg-primary text-primary-foreground px-3 py-1.5 font-medium disabled:opacity-60"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : draft ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {loading ? "Genererer…" : draft ? "Generér igen" : "Generér udkast"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-warning/40 bg-warning/5 p-3 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {draft && (
        <div className="mt-5 space-y-4">
          <h3 className="text-base font-semibold tracking-tight">{draft.title}</h3>

          <Section label="Resumé">
            <p className="text-sm leading-relaxed text-foreground/85">{draft.executiveSummary}</p>
          </Section>

          <div className="grid md:grid-cols-2 gap-4">
            <Section label="Nøglefund">
              <BulletList items={draft.keyFindings} />
            </Section>
            <Section label="Risici" tone="warning">
              <BulletList items={draft.risks} />
            </Section>
            <Section label="Anbefalinger" tone="success">
              <BulletList items={draft.recommendations} />
            </Section>
            <Section label="Næste skridt">
              <BulletList items={draft.nextSteps} />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "success" | "warning";
  children: React.ReactNode;
}) {
  const dot =
    tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-primary";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          {label}
        </div>
      </div>
      {children}
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-sm text-foreground/85">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-primary mt-0.5">•</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
