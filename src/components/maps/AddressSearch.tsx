/**
 * AddressSearch — Autocomplete-søgning på danske adresser og stednavne.
 * Går via server-fn `searchPlaces` så vi kan skifte kilde uden UI-ændringer
 * og holde eventuelle credentials væk fra klienten.
 */
import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { searchPlaces, resolvePlace, type PlaceSuggestion } from "@/lib/geo-search.functions";

export interface AddressPick {
  label: string;
  lat: number;
  lng: number;
}

export function AddressSearch({
  onSelect,
  placeholder = "Søg på adresse, vej, stednavn eller koordinater…",
}: {
  onSelect: (pick: AddressPick) => void;
  placeholder?: string;
}) {
  const search = useServerFn(searchPlaces);
  const resolve = useServerFn(resolvePlace);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqIdRef = useRef(0);

  // Prøv at parse "lat, lng" koordinater i søgefeltet
  const coordMatch = (s: string): { lat: number; lng: number } | null => {
    const m = s.trim().match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    // DK-bounds check: enten "lat, lng" eller "lng, lat"
    if (a >= 54 && a <= 58 && b >= 7 && b <= 16) return { lat: a, lng: b };
    if (b >= 54 && b <= 58 && a >= 7 && a <= 16) return { lat: b, lng: a };
    return null;
  };

  useEffect(() => {
    const query = q.trim();
    setError(null);
    if (query.length < 2) { setItems([]); setOpen(false); return; }
    const t = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true);
      try {
        const data = await search({ data: { q: query } });
        if (id !== reqIdRef.current) return;
        setItems(data);
        setOpen(true);
        setHighlight(0);
      } catch {
        if (id !== reqIdRef.current) return;
        setError("Kunne ikke hente søgeforslag");
        setItems([]);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = async (item: PlaceSuggestion) => {
    let lat = item.lat, lng = item.lng;
    if ((lat == null || lng == null) && item.href) {
      try {
        const r = await resolve({ data: { href: item.href } });
        if (r) { lat = r.lat; lng = r.lng; }
      } catch { /* ignore */ }
    }
    if (lat == null || lng == null) {
      setError("Kunne ikke slå koordinater op for dette forslag");
      return;
    }
    onSelect({ label: item.tekst, lat, lng });
    setQ(item.tekst);
    setOpen(false);
  };

  const submit = () => {
    const coord = coordMatch(q);
    if (coord) {
      onSelect({ label: `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`, ...coord });
      setOpen(false);
      return;
    }
    const it = items[highlight];
    if (it) void pick(it);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); submit(); return; }
            if (!open) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {loading && (
          <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
        {q && !loading && (
          <button
            type="button"
            onClick={() => { setQ(""); setItems([]); setOpen(false); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Ryd søgning"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <p className="text-xs text-destructive mt-1">{error}</p>}

      {open && items.length > 0 && (
        <ul className="absolute z-[1200] left-0 right-0 mt-1.5 max-h-72 overflow-auto rounded-xl border bg-popover shadow-lg text-sm">
          {items.map((it, i) => (
            <li
              key={`${it.type}-${i}-${it.tekst}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => { e.preventDefault(); void pick(it); }}
              className={`px-3 py-2 cursor-pointer flex items-center gap-2 ${
                i === highlight ? "bg-primary/10" : "hover:bg-muted"
              }`}
            >
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0 w-16">
                {it.type}
              </span>
              <span className="truncate">{it.tekst}</span>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && items.length === 0 && q.trim().length >= 2 && !coordMatch(q) && (
        <div className="absolute z-[1200] left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-lg text-sm px-3 py-2 text-muted-foreground">
          Ingen forslag fundet
        </div>
      )}
    </div>
  );
}
