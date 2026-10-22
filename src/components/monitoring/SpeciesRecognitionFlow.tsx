// SpeciesRecognitionFlow — upload et billede → Lovable AI (Gemini vision) → forslag → gem som observation.
import * as React from "react";
import { Upload, Sparkles, Check, X, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { identifySpeciesFromImage, type IdentifiedSpecies } from "@/lib/species-id.functions";
import { createObservation } from "@/services/monitoring/observations-service";
import { useAuth } from "@/lib/auth";

interface Props {
  projectId: string;
  onSaved?: () => void;
}

export function SpeciesRecognitionFlow({ projectId, onSaved }: Props) {
  const identify = useServerFn(identifySpeciesFromImage);
  const { user } = useAuth();
  const [image, setImage] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<IdentifiedSpecies[]>([]);
  const [selected, setSelected] = React.useState<number | null>(null);
  const [notes, setNotes] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  const reset = () => {
    setImage(null);
    setSuggestions([]);
    setSelected(null);
    setNotes("");
    setError(null);
    setSaved(false);
  };

  async function handleFile(file: File) {
    setError(null);
    setSaved(false);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setImage(dataUrl);
      setBusy(true);
      setSuggestions([]);
      try {
        const res = await identify({ data: { imageDataUrl: dataUrl } });
        if (res.error) setError(res.message ?? "AI-analysen fejlede");
        setSuggestions(res.species);
        if (res.species.length > 0) setSelected(0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ukendt fejl");
      } finally {
        setBusy(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function save() {
    if (selected == null || !suggestions[selected]) return;
    const s = suggestions[selected];
    setBusy(true);
    try {
      await createObservation({
        project_id: projectId,
        observation_type: "species",
        observed_at: new Date().toISOString(),
        observer_id: user?.id ?? null,
        species_name: s.scientificName,
        species_confidence: s.confidence * 100,
        count_value: 1,
        notes: notes || s.notes || null,
        visibility: "precise",
        status: "confirmed",
        metadata: { danish_name: s.danishName, group: s.group, ai_suggestion: true } as never,
      });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme observation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!image && (
        <label className="block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/30">
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm font-medium">Upload feltbillede</div>
          <div className="text-xs text-muted-foreground mt-1">
            AI foreslår arter og du bekræfter inden observationen gemmes.
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {image && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl overflow-hidden border bg-muted/20">
            <img src={image} alt="Feltbillede" className="w-full h-64 object-cover" />
            <button
              onClick={reset}
              className="w-full text-xs px-3 py-2 border-t hover:bg-muted inline-flex items-center justify-center gap-1"
            >
              <X className="h-3 w-3" /> Nyt billede
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" /> AI-forslag
            </div>
            {busy && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Analyserer…
              </div>
            )}
            {error && <div className="text-xs text-destructive">{error}</div>}
            {!busy && suggestions.length === 0 && !error && (
              <p className="text-xs text-muted-foreground">Ingen arter kunne identificeres.</p>
            )}
            <ul className="space-y-1">
              {suggestions.map((s, i) => (
                <li key={i}>
                  <button
                    onClick={() => setSelected(i)}
                    className={`w-full text-left rounded-lg border p-2.5 transition ${
                      selected === i ? "border-primary bg-primary/5" : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{s.danishName}</div>
                        <div className="text-xs text-muted-foreground italic">{s.scientificName}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted">
                        {Math.round(s.confidence * 100)}%
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{s.group}</div>
                  </button>
                </li>
              ))}
            </ul>

            {selected != null && !saved && (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Noter (valgfri)…"
                  className="w-full text-sm rounded-lg border bg-background px-3 py-2 min-h-[60px]"
                />
                <button
                  onClick={save}
                  disabled={busy}
                  className="w-full text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground inline-flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Gem observation
                </button>
              </>
            )}

            {saved && (
              <div className="text-sm text-success bg-success/10 border border-success/30 rounded-lg p-3 inline-flex items-center gap-2">
                <Check className="h-4 w-4" /> Observation gemt.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
