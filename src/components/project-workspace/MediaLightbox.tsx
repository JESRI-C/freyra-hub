import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, MapPin, Compass, Calendar, Tag, Camera, Layers } from "lucide-react";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { MEDIA_CATEGORY_LABELS } from "@/lib/platform/media-types";
import { BeforeAfterCompare } from "./BeforeAfterCompare";

interface Props {
  items: ProjectMediaItem[];
  activeId: string | null;
  onClose: () => void;
  onChange?: (id: string) => void;
}

export function MediaLightbox({ items, activeId, onClose, onChange }: Props) {
  const [compare, setCompare] = useState(false);
  const idx = items.findIndex((m) => m.id === activeId);
  const item = idx >= 0 ? items[idx] : null;

  useEffect(() => {
    setCompare(false);
  }, [activeId]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && idx < items.length - 1) onChange?.(items[idx + 1].id);
      if (e.key === "ArrowLeft" && idx > 0) onChange?.(items[idx - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, item, items, onChange, onClose]);

  if (!item) return null;

  const before = item.beforeMediaId ? items.find((m) => m.id === item.beforeMediaId) : null;
  const dateLabel = new Date(item.capturedAt ?? item.uploadedAt).toLocaleString("da-DK");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-stretch"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        aria-label="Luk"
      >
        <X className="h-5 w-5" />
      </button>

      {idx > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(items[idx - 1].id);
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {idx < items.length - 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChange?.(items[idx + 1].id);
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <div
        className="flex-1 flex flex-col lg:flex-row items-stretch"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 flex items-center justify-center p-4 lg:p-10 min-h-0">
          {compare && before ? (
            <BeforeAfterCompare beforeUrl={before.url} afterUrl={item.url} beforeLabel="Før" afterLabel="Nu" />
          ) : (
            <img
              src={item.url}
              alt={item.title}
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
            />
          )}
        </div>

        <aside className="w-full lg:w-96 bg-background border-l overflow-y-auto p-5 space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{item.title}</h3>
            {item.description && (
              <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
            )}
          </div>

          <div className="space-y-2 text-sm">
            <Row icon={<Camera className="h-4 w-4" />} label="Kategori">
              {MEDIA_CATEGORY_LABELS[item.category]}
            </Row>
            <Row icon={<Layers className="h-4 w-4" />} label="Kilde">
              {item.source}
            </Row>
            <Row icon={<Calendar className="h-4 w-4" />} label="Optaget">
              {dateLabel}
            </Row>
            {item.coordinates && (
              <Row icon={<MapPin className="h-4 w-4" />} label="Position">
                {item.coordinates.lat.toFixed(5)}, {item.coordinates.lng.toFixed(5)}
              </Row>
            )}
            {item.direction != null && (
              <Row icon={<Compass className="h-4 w-4" />} label="Retning">
                {item.direction}°
              </Row>
            )}
          </div>

          {item.tags.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <Tag className="h-3 w-3" /> Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => (
                  <span key={t} className="text-[11px] px-2 py-0.5 rounded bg-muted">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(item.actionId || item.documentId) && (
            <div className="space-y-1 text-xs">
              {item.actionId && (
                <div>
                  <span className="text-muted-foreground">Handling: </span>
                  <span className="font-mono">{item.actionId.slice(0, 8)}…</span>
                </div>
              )}
              {item.documentId && (
                <div>
                  <span className="text-muted-foreground">Dokument: </span>
                  <span className="font-mono">{item.documentId.slice(0, 8)}…</span>
                </div>
              )}
            </div>
          )}

          {before && (
            <div className="pt-2 border-t">
              <button
                onClick={() => setCompare((c) => !c)}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted"
              >
                <Layers className="h-4 w-4" />
                {compare ? "Vis kun aktuelt billede" : "Sammenlign før / efter"}
              </button>
            </div>
          )}

          <div className="pt-2 border-t text-xs text-muted-foreground">
            Billede {idx + 1} af {items.length}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div>{children}</div>
      </div>
    </div>
  );
}
