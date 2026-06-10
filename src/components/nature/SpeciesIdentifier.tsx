/**
 * SpeciesIdentifier — billede-upload + AI-artsgenkendelse
 *
 * Flow: drop/vælg billede → Gemini vision → GBIF/rødliste → vælg → gem som observationer.
 * Resultaterne fodrer direkte ind i biodiversitetsberegningen.
 */

import { useRef, useState, useCallback } from "react";
import { Card, CardHeader, Pill } from "@/components/ui-bits";
import { useSpeciesIdentification } from "@/hooks/useSpeciesIdentification";
import { RED_LIST_LABELS, redListTone, confidenceLabel } from "@/services/nature/species-service";
import type { Project } from "@/lib/supabase/types";

export function SpeciesIdentifier({ project }: { project: Project | null }) {
  const sid = useSpeciesIdentification(project);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [hint, setHint] = useState("");

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (file) void sid.identifyFile(file, hint || undefined);
  }, [sid, hint]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  return (
    <Card>
      <CardHeader title="Artsgenkendelse fra billede" subtitle="Upload feltbillede — AI identificerer arter" />
      <div className="px-5 pb-5 space-y-4">
        {/* ── Upload-zone (skjules under review/saved) ──────────────────────── */}
        {(sid.phase === "idle" || sid.phase === "error") && (
          <>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Valgfri kontekst, fx 'fugl ved vandløb i zone B'"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`w-full rounded-xl border-2 border-dashed py-10 px-4 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <div className="text-3xl mb-2">📷</div>
              <div className="text-sm font-medium">Træk et billede hertil eller klik for at vælge</div>
              <div className="text-xs text-muted-foreground mt-1">JPEG/PNG · maks 8 MB</div>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </>
        )}

        {/* ── Fejl ──────────────────────────────────────────────────────────── */}
        {sid.error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {sid.error}
          </div>
        )}

        {/* ── Arbejder ──────────────────────────────────────────────────────── */}
        {sid.isWorking && (
          <div className="flex items-center gap-3 py-4">
            {sid.previewUrl && (
              <img src={sid.previewUrl} alt="" className="h-16 w-16 rounded-lg object-cover border" />
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              {sid.phaseLabel}
            </div>
          </div>
        )}

        {/* ── Review: fundne arter ──────────────────────────────────────────── */}
        {sid.phase === "review" && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              {sid.previewUrl && (
                <img src={sid.previewUrl} alt="" className="h-20 w-20 rounded-lg object-cover border shrink-0" />
              )}
              <div className="text-sm">
                {sid.results.length === 0
                  ? "Ingen arter kunne identificeres på billedet. Prøv et tydeligere billede."
                  : `${sid.results.length} mulige art${sid.results.length > 1 ? "er" : ""} fundet. Vælg dem der skal registreres.`}
              </div>
            </div>

            {sid.results.map((sp) => {
              const isSelected = sid.selected.has(sp.scientificName);
              return (
                <button
                  key={sp.scientificName}
                  onClick={() => sid.toggleSpecies(sp.scientificName)}
                  className={`w-full text-left rounded-xl border p-3 transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{sp.danishName}</div>
                      <div className="text-xs italic text-muted-foreground truncate">{sp.scientificName}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {sp.protected && <Pill tone="danger">Fredet</Pill>}
                      {sp.redListStatus && (
                        <Pill tone={redListTone(sp.redListStatus)}>
                          {sp.redListStatus}
                        </Pill>
                      )}
                      <span className={`h-4 w-4 rounded border flex items-center justify-center text-[10px] ${
                        isSelected ? "bg-primary text-primary-foreground border-primary" : "border-border"
                      }`}>
                        {isSelected ? "✓" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span>{sp.group}</span>
                    <span>·</span>
                    <span>{confidenceLabel(sp.confidence)} ({Math.round(sp.confidence * 100)}%)</span>
                    {sp.gbifMatch && (<><span>·</span><span className="text-emerald-600">GBIF ✓</span></>)}
                    {sp.redListStatus && (<><span>·</span><span>{RED_LIST_LABELS[sp.redListStatus]}</span></>)}
                  </div>
                  {sp.notes && <div className="text-xs text-muted-foreground mt-1">{sp.notes}</div>}
                </button>
              );
            })}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => sid.confirm()}
                disabled={sid.selectedCount === 0}
                className="flex-1 text-sm rounded-lg bg-primary text-primary-foreground px-3 py-2.5 font-medium disabled:opacity-50"
              >
                Gem {sid.selectedCount > 0 ? `${sid.selectedCount} ` : ""}observation{sid.selectedCount === 1 ? "" : "er"}
              </button>
              <button onClick={sid.reset} className="text-sm rounded-lg border px-3 py-2.5 hover:bg-muted">
                Annullér
              </button>
            </div>
          </div>
        )}

        {/* ── Gemt ──────────────────────────────────────────────────────────── */}
        {sid.phase === "saved" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-3 text-sm text-success flex items-center gap-2">
              <span className="text-lg">✓</span>
              {sid.savedCount} observation{sid.savedCount === 1 ? "" : "er"} gemt og indregnet i biodiversitetsindekset.
            </div>
            <button onClick={sid.reset} className="w-full text-sm rounded-lg border px-3 py-2 hover:bg-muted">
              Analysér nyt billede
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
