import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, AlertTriangle, RefreshCw } from "lucide-react";
import { generateModuleInsight } from "@/lib/ai.functions";

type Props = {
  module: string;
  context: string;
  tone?: "insight" | "action" | "risk";
  /** Stable identifier — used as cache key so banner doesn't re-fetch on every render. */
  cacheKey?: string;
};

export function AiInsightBanner({ module, context, tone = "insight", cacheKey }: Props) {
  const fn = useServerFn(generateModuleInsight);
  const key = cacheKey ?? `${module}:${tone}`;

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["ai-insight", key],
    queryFn: () => fn({ data: { module, context, tone } }),
    staleTime: 1000 * 60 * 10, // 10 min
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const isError = data?.error === true;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 ${
        isError
          ? "border-warning/40 bg-warning/5"
          : "border-primary/20 bg-gradient-to-br from-primary/5 via-leaf/10 to-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-9 w-9 grid place-items-center rounded-xl flex-shrink-0 ${
            isError ? "bg-warning/15 text-warning" : "bg-primary/15 text-primary"
          }`}
        >
          {isError ? <AlertTriangle className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
              {data?.headline ?? "AI-indsigt"}
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border text-muted-foreground">
              Gemini
            </span>
          </div>
          <div className="mt-1 text-sm text-foreground leading-relaxed min-h-[1.25rem]">
            {isLoading ? (
              <span className="inline-flex gap-1 items-center text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-pulse [animation-delay:300ms]" />
                <span className="ml-1 text-xs">AI læser projektdata…</span>
              </span>
            ) : (
              data?.body
            )}
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 w-7 grid place-items-center rounded-lg border bg-card hover:bg-muted transition disabled:opacity-50"
          title="Generér ny indsigt"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}
