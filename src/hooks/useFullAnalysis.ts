/**
 * useFullAnalysis — kører hele analysekæden med fremdrift og caching.
 *
 * Brug i UI:
 *   const a = useFullAnalysis(project);
 *   <button onClick={a.run}>Kør fuld analyse</button>
 *   a.summary.biodiversityScore // 68
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  runFullAnalysis,
  summarizeAnalysis,
  type AnalysisStep,
  type FullAnalysisResult,
  type AnalysisSummary,
} from "@/services/analysis-orchestrator";
import type { Project } from "@/lib/supabase/types";

const STEP_LABELS: Record<AnalysisStep, string> = {
  ndvi: "Henter Sentinel-2 satellitdata…",
  biodiversity: "Analyserer §3-natur og arter…",
  carbon: "Beregner CO₂-binding…",
  water: "Vurderer vandkvalitetsrisiko…",
  done: "Færdig",
};

export function useFullAnalysis(project: Project | null) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<AnalysisStep | null>(null);
  const [result, setResult] = useState<FullAnalysisResult | null>(null);

  const mutation = useMutation({
    mutationFn: () => runFullAnalysis(project!, setStep),
    onSuccess: (r) => {
      setResult(r);
      setStep(null);
      // Indikatorer og metrics er opdateret i DB — refetch alt afhængigt
      void queryClient.invalidateQueries({ queryKey: ["indicators"] });
      void queryClient.invalidateQueries({ queryKey: ["project-metrics"] });
      void queryClient.invalidateQueries({ queryKey: ["nature-data"] });
    },
    onError: () => setStep(null),
  });

  const summary: AnalysisSummary | null = result ? summarizeAnalysis(result) : null;

  return {
    run: () => { if (project) mutation.mutate(); },
    isRunning: mutation.isPending,
    step,
    stepLabel: step ? STEP_LABELS[step] : null,
    result,
    summary,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    stepsFailed: result?.stepsFailed ?? [],
    durationS: result ? Math.round(result.durationMs / 100) / 10 : null,
  };
}
