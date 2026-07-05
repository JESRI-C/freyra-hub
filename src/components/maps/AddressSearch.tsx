/**
 * AddressSearch — Autocomplete-søgning på danske adresser via DAWA (Dataforsyningen).
 * Ingen API-nøgle nødvendig. Returnerer lat/lng når brugeren vælger et forslag.
 * Docs: https://dawadocs.dataforsyningen.dk/dok/api/autocomplete
 */
import { useEffect, useRef, useState } from "react";
import { Search, X, Loader2 } from "lucide-react";

export interface AddressPick {
  label: string;
  lat: number;
  lng: number;
}

interface DawaAutocompleteItem {
  tekst: string;
  type: string;
  data?: {
    id?: string;
    // adresse
    adressebetegnelse?: string;
    x?: number; // lng
    y?: number; // lat
    // adgangsadresse
    href?: string;
  };
}

const DAWA_AUTOCOMPLETE = "https://api.dataforsyningen.dk/autocomplete";

export function AddressSearch({
  onSelect,
  placeholder = "Søg adresse, vej eller stednavn i Danmark…",
}: {
  onSelect: (pick: AddressPick) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<DawaAutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced autocomplete
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const url = `${DAWA_AUTOCOMPLETE}?q=${encodeURIComponent(query)}&per_side=8&fuzzy=`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error("Netværksfejl");
        const data = (await res.json()) as DawaAutocompleteItem[];
        setItems(data);
        setOpen(true);
        setHighlight(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setItems([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pick = async (item: DawaAutocompleteItem) => {
    // Adresse-typer returnerer koordinater direkte i data.x/y.
    // Andre (vej, stednavn) kræver opslag via href.
    let lat: number | undefined = item.data?.y;
    let lng: number | undefined = item.data?.x;
    if ((lat == null || lng == null) && item.data?.href) {
      try {
        const res = await fetch(item.data.href);
        if (res.ok) {
          const detail = (await res.json()) as { adgangspunkt?: { koordinater?: [number, number] }; visueltcenter?: [number, number] };
          const coords = detail?.adgangspunkt?.koordinater ?? detail?.visueltcenter;
          if (coords) {
            lng = coords[0];
            lat = coords[1];
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (lat == null || lng == null) return;
    onSelect({ label: item.tekst, lat, lng });
    setQ(item.tekst);
    setOpen(false);
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
            if (!open) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); const it = items[highlight]; if (it) void pick(it); }
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
    </div>
  );
}
