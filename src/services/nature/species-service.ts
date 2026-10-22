/**
 * Species Service
 * Beriger AI-identificerede arter med:
 *   - GBIF taxonomi-validering (https://api.gbif.org — gratis, ingen nøgle)
 *   - Dansk rødlistestatus (statisk opslag + GBIF IUCN-kategori)
 *   - Beskyttelsesstatus (bilag IV, fredede arter)
 *
 * Gemmer bekræftede arter som observationer der indgår i biodiversitetsberegningen.
 */

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { recordObservation } from "@/services/observations-service";
import { logAuditEvent } from "@/services/audit-service";
import type { IdentifiedSpecies } from "@/lib/species-id.functions";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichedSpecies extends IdentifiedSpecies {
  gbifKey: number | null;
  gbifMatch: boolean;
  acceptedName: string | null;
  redListStatus: RedListCategory | null;
  protected: boolean;          // bilag IV / fredet
  vernacularNames: string[];
}

export type RedListCategory = "RE" | "CR" | "EN" | "VU" | "NT" | "LC" | "DD" | "NA";

export const RED_LIST_LABELS: Record<RedListCategory, string> = {
  RE: "Regionalt uddød",
  CR: "Kritisk truet",
  EN: "Truet",
  VU: "Sårbar",
  NT: "Næsten truet",
  LC: "Ikke truet",
  DD: "Utilstrækkelige data",
  NA: "Ikke vurderet",
};

// ─── Dansk beskyttelse — bilag IV-arter (habitatdirektivet) ────────────────────
// Udvalg af de mest relevante strengt beskyttede arter i DK.
const PROTECTED_SPECIES = new Set([
  "Lutra lutra",          // Odder
  "Myotis",               // Flagermus (slægt)
  "Triturus cristatus",   // Stor vandsalamander
  "Bombina bombina",      // Klokkefrø
  "Pelobates fuscus",     // Løgfrø
  "Bufo calamita",        // Strandtudse
  "Bufo viridis",         // Grønbroget tudse
  "Rana arvalis",         // Spidssnudet frø
  "Rana dalmatina",       // Springfrø
  "Hyla arborea",         // Løvfrø
  "Coronella austriaca",  // Glat snog
  "Muscardinus avellanarius", // Hasselmus
  "Castor fiber",         // Bæver
]);

// Statisk dansk rødliste-udvalg (kan udvides med fuld liste fra DCE)
const RED_LIST_DK: Record<string, RedListCategory> = {
  "Ciconia ciconia": "CR",       // Hvid stork
  "Lutra lutra": "LC",           // Odder (genindvandret)
  "Drosera rotundifolia": "NT",  // Rundbladet soldug
  "Triturus cristatus": "VU",    // Stor vandsalamander
  "Bombina bombina": "EN",       // Klokkefrø
  "Hyla arborea": "VU",          // Løvfrø
  "Circus aeruginosus": "LC",    // Rørhøg
  "Pandion haliaetus": "EN",     // Fiskeørn
  "Haliaeetus albicilla": "NT",  // Havørn
};

// ─── GBIF berigelse ────────────────────────────────────────────────────────────

interface GbifMatch {
  usageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  status?: string;
  matchType?: string;
  confidence?: number;
}

async function matchGbif(scientificName: string): Promise<GbifMatch | null> {
  try {
    const res = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientificName)}&strict=false`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as GbifMatch;
  } catch {
    return null;
  }
}

async function gbifVernacular(usageKey: number): Promise<string[]> {
  try {
    const res = await fetch(
      `https://api.gbif.org/v1/species/${usageKey}/vernacularNames?limit=20`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { results?: Array<{ vernacularName: string; language?: string }> };
    return (json.results ?? [])
      .filter((r) => r.language === "dan" || r.language === "eng")
      .map((r) => r.vernacularName)
      .slice(0, 5);
  } catch {
    return [];
  }
}

/** Beriger én art med GBIF + rødliste + beskyttelse. */
export async function enrichSpecies(s: IdentifiedSpecies): Promise<EnrichedSpecies> {
  const gbif = await matchGbif(s.scientificName);
  const gbifKey = gbif?.usageKey ?? null;
  const acceptedName = gbif?.canonicalName ?? gbif?.scientificName ?? null;
  const gbifMatch = (gbif?.matchType ?? "NONE") !== "NONE";

  const vernacularNames = gbifKey ? await gbifVernacular(gbifKey) : [];

  // Rødliste: tjek både identificeret navn og GBIF-accepteret navn + slægt
  const genus = s.scientificName.split(" ")[0];
  const redListStatus =
    RED_LIST_DK[s.scientificName] ??
    (acceptedName ? RED_LIST_DK[acceptedName] : undefined) ??
    RED_LIST_DK[genus] ??
    null;

  const isProtected =
    PROTECTED_SPECIES.has(s.scientificName) ||
    PROTECTED_SPECIES.has(genus) ||
    (acceptedName ? PROTECTED_SPECIES.has(acceptedName) : false);

  return {
    ...s,
    gbifKey,
    gbifMatch,
    acceptedName,
    redListStatus,
    protected: isProtected,
    vernacularNames,
  };
}

/** Beriger en hel liste parallelt. */
export async function enrichSpeciesList(species: IdentifiedSpecies[]): Promise<EnrichedSpecies[]> {
  return Promise.all(species.map(enrichSpecies));
}

// ─── Gem bekræftede arter som observationer ───────────────────────────────────

export interface SaveSpeciesInput {
  projectId: string;
  species: EnrichedSpecies[];
  mediaId?: string;
  coordinates?: { lat: number; lng: number };
}

export async function saveSpeciesObservations(input: SaveSpeciesInput): Promise<{ saved: number }> {
  if (!isSupabaseConfigured || !supabase) {
    return { saved: 0 };
  }

  let saved = 0;
  for (const sp of input.species) {
    try {
      await recordObservation({
        project_id: input.projectId,
        observation_type: "field",
        indicator_key: "species_observation",
        value: Math.round(sp.confidence * 100),
        unit: "% konfidens",
        confidence: sp.confidence,
        metadata: {
          scientific_name: sp.scientificName,
          accepted_name: sp.acceptedName,
          danish_name: sp.danishName,
          group: sp.group,
          gbif_key: sp.gbifKey,
          red_list_status: sp.redListStatus,
          protected: sp.protected,
          media_id: input.mediaId ?? null,
          source: "ai_image_id",
          ...(input.coordinates ? { lat: input.coordinates.lat, lng: input.coordinates.lng } : {}),
        },
      });
      saved++;
    } catch {
      // fortsæt med resten
    }
  }

  if (saved > 0) {
    const protectedCount = input.species.filter((s) => s.protected).length;
    const redListed = input.species.filter((s) => s.redListStatus && !["LC", "NA", "DD"].includes(s.redListStatus)).length;
    void logAuditEvent({
      project_id: input.projectId,
      event_type: "species_identified",
      title: `${saved} art${saved > 1 ? "er" : ""} registreret fra feltbillede`,
      description: [
        input.species.map((s) => s.danishName).join(", "),
        protectedCount > 0 ? `${protectedCount} fredede` : null,
        redListed > 0 ? `${redListed} rødlistede` : null,
      ].filter(Boolean).join(" · "),
      actor: "Artsgenkendelse (AI)",
      source: "automated",
    });
  }

  return { saved };
}

// ─── UI-hjælpere ──────────────────────────────────────────────────────────────

export function redListTone(status: RedListCategory | null): "danger" | "warning" | "default" {
  if (!status) return "default";
  if (["RE", "CR", "EN"].includes(status)) return "danger";
  if (["VU", "NT"].includes(status)) return "warning";
  return "default";
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return "Høj sikkerhed";
  if (confidence >= 0.6) return "Moderat sikkerhed";
  if (confidence >= 0.4) return "Lav sikkerhed";
  return "Usikker";
}
