/**
 * AreaCadastrePanel — viser hvilke matrikler og markblokke der ligger i/skærer
 * projektets tegnede område. Slår automatisk op når polygonen ændrer sig.
 * Klik på en række fremhæver geometrien på kortet.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Grid2x2, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import {
  listMatriklerInArea,
  listMarkblokkeInArea,
  type AreaLookupResult,
} from "@/lib/geo-search.functions";
import { downsampleRing, type LngLat } from "@/services/geo-lookup-transform";
import type { GeoJsonPolygon } from "@/services/zones-service";

interface Props {
  polygon: GeoJsonPolygon | null;
  onHighlight?: (geometry: GeoJsonPolygon | null) => void;
}

const EMPTY: AreaLookupResult = { items: [], truncated: false };

export function AreaCadastrePanel({ polygon, onHighlight }: Props) {
  const matrikelFn = useServerFn(listMatriklerInArea);
  const markblokFn = useServerFn(listMarkblokkeInArea);
  const [openList, setOpenList] = useState<"matrikler" | "markblokke" | null>("matrikler");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  // Stabil nøgle + nedsamplet ring til API'erne.
  const ring = useMemo<LngLat[] | null>(() => {
    const raw = polygon?.coordinates?.[0];
    if (!raw || raw.length < 3) return null;
    return downsampleRing(raw as LngLat[], 500);
  }, [polygon]);
  const ringKey = useMemo(() => (ring ? JSON.stringify(ring.slice(0, 8)) + ring.length : "none"), [ring]);

  const matrikler = useQuery({
    queryKey: ["area-matrikler", ringKey],
    queryFn: async () => {
      try {
        return await matrikelFn({ data: { ring: ring! } });
      } catch {
        return EMPTY;
      }
    },
    enabled: !!ring,
    staleTime: 10 * 60 * 1000,
  });
  const markblokke = useQuery({
    queryKey: ["area-markblokke", ringKey],
    queryFn: async () => {
      try {
        return await markblokFn({ data: { ring: ring! } });
      } catch {
        return EMPTY;
      }
    },
    enabled: !!ring,
    staleTime: 10 * 60 * 1000,
  });

  if (!polygon) return null;

  const highlight = (id: string, geometry: unknown) => {
    if (highlightedId === id) {
      setHighlightedId(null);
      onHighlight?.(null);
      return;
    }
    setHighlightedId(id);
    // MultiPolygon → første polygon til preview-mekanikken.
    const g = geometry as { type: string; coordinates: unknown } | null;
    if (!g) return;
    if (g.type === "Polygon") onHighlight?.(g as GeoJsonPolygon);
    else if (g.type === "MultiPolygon") {
      const first = (g.coordinates as number[][][][])[0];
      if (first) onHighlight?.({ type: "Polygon", coordinates: first } as GeoJsonPolygon);
    }
  };

  const totalHa = (r?: AreaLookupResult) =>
    Math.round((r?.items ?? []).reduce((s, i) => s + (i.areaHa ?? 0), 0) * 10) / 10;

  const section = (
    key: "matrikler" | "markblokke",
    title: string,
    icon: React.ReactNode,
    result: AreaLookupResult | undefined,
    loading: boolean,
  ) => {
    const open = openList === key;
    const items = result?.items ?? [];
    return (
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setOpenList(open ? null : key)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm bg-muted/40 hover:bg-muted/70 transition"
        >
          {icon}
          <span className="font-medium">{title}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {loading ? "Slår op…" : `${items.length}${result?.truncated ? "+" : ""} · ${totalHa(result)} ha`}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {open && (
          <ul className="max-h-56 overflow-y-auto divide-y">
            {items.length === 0 && !loading && (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                Ingen fundet i området{result === undefined ? " (opslag fejlede)" : ""}.
              </li>
            )}
            {items.map((it) => (
              <li key={it.id}>
                <button
                  onClick={() => highlight(it.id, it.geometry)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition ${
                    highlightedId === it.id ? "bg-primary/10 text-primary font-medium" : ""
                  }`}
                >
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{it.label}</span>
                  {it.areaHa != null && (
                    <span className="ml-auto text-muted-foreground shrink-0">{it.areaHa} ha</span>
                  )}
                </button>
              </li>
            ))}
            {result?.truncated && (
              <li className="px-3 py-1.5 text-[11px] text-amber-600">
                Viser de første 500 — indsnævr området for fuldt overblik.
              </li>
            )}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold flex items-center gap-2">
        <Grid2x2 className="h-4 w-4 text-primary" />
        Matrikler & markblokke i området
      </div>
      {section("matrikler", "Matrikler", <Landmark className="h-3.5 w-3.5 text-primary" />, matrikler.data, matrikler.isLoading)}
      {section("markblokke", "Markblokke", <Grid2x2 className="h-3.5 w-3.5 text-primary" />, markblokke.data, markblokke.isLoading)}
      <p className="text-[11px] text-muted-foreground">
        Kilder: SDFI/Dataforsyningen (matrikler) · Landbrugsstyrelsen (markblokke). Klik på en række for at se den på kortet.
      </p>
    </div>
  );
}
