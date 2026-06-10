/**
 * useSpeciesIdentification
 * Komplet flow: vælg billede → AI-identifikation → GBIF-berigelse → gem.
 *
 * Brug i UI:
 *   const sid = useSpeciesIdentification(project);
 *   <input type="file" onChange={e => sid.identifyFile(e.target.files[0])} />
 *   sid.results // EnrichedSpecies[]
 *   sid.confirm() // gemmer som observationer
 */

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { identifySpeciesFromImage } from "@/lib/species-id.functions";
import { enrichSpeciesList, saveSpeciesObservations, type EnrichedSpecies } from "@/services/nature/species-service";
import type { Project } from "@/lib/supabase/types";

type Phase = "idle" | "reading" | "identifying" | "enriching" | "review" | "saving" | "saved" | "error";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function useSpeciesIdentification(project: Project | null) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<EnrichedSpecies[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  // Brugeren kan fravælge enkelte arter inden gem
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setPhase("idle");
    setResults([]);
    setPreviewUrl(null);
    setError(null);
    setSavedCount(0);
    setSelected(new Set());
  }, []);

  const identifyFile = useCallback(async (file: File, hint?: string) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Filen er ikke et billede.");
      setPhase("error");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Billedet er for stort (maks 8 MB).");
      setPhase("error");
      return;
    }

    try {
      setPhase("reading");
      const dataUrl = await fileToDataUrl(file);
      setPreviewUrl(dataUrl);

      setPhase("identifying");
      const idResult = await identifySpeciesFromImage({ data: { imageDataUrl: dataUrl, hint } });

      if (idResult.error) {
        setError(idResult.message ?? "AI-fejl");
        setPhase("error");
        return;
      }
      if (idResult.species.length === 0) {
        setResults([]);
        setPhase("review");
        return;
      }

      setPhase("enriching");
      const enriched = await enrichSpeciesList(idResult.species);
      setResults(enriched);
      // Vælg alle med rimelig konfidens som default
      setSelected(new Set(enriched.filter((s) => s.confidence >= 0.4).map((s) => s.scientificName)));
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl ved billedanalyse.");
      setPhase("error");
    }
  }, []);

  const toggleSpecies = useCallback((scientificName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scientificName)) next.delete(scientificName);
      else next.add(scientificName);
      return next;
    });
  }, []);

  const confirm = useCallback(async (coordinates?: { lat: number; lng: number }) => {
    if (!project) {
      setError("Intet aktivt projekt.");
      return;
    }
    const toSave = results.filter((s) => selected.has(s.scientificName));
    if (toSave.length === 0) {
      setError("Vælg mindst én art at gemme.");
      return;
    }

    try {
      setPhase("saving");
      const coords = coordinates ?? (project.geometry_centroid_lat != null && project.geometry_centroid_lng != null
        ? { lat: project.geometry_centroid_lat, lng: project.geometry_centroid_lng }
        : undefined);

      const { saved } = await saveSpeciesObservations({
        projectId: project.id,
        species: toSave,
        coordinates: coords,
      });

      setSavedCount(saved);
      setPhase("saved");

      // Biodiversitet og observationer afhænger af de nye arter
      void queryClient.invalidateQueries({ queryKey: ["nature-data"] });
      void queryClient.invalidateQueries({ queryKey: ["biodiversity"] });
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke gemme arter.");
      setPhase("error");
    }
  }, [project, results, selected, queryClient]);

  return {
    phase,
    isWorking: ["reading", "identifying", "enriching", "saving"].includes(phase),
    phaseLabel: PHASE_LABELS[phase],
    results,
    previewUrl,
    error,
    savedCount,
    selected,
    selectedCount: selected.size,
    identifyFile,
    toggleSpecies,
    confirm,
    reset,
  };
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: "Vælg eller træk et feltbillede",
  reading: "Indlæser billede…",
  identifying: "AI analyserer arter…",
  enriching: "Validerer mod GBIF og rødliste…",
  review: "Gennemse fundne arter",
  saving: "Gemmer observationer…",
  saved: "Gemt",
  error: "Fejl",
};
