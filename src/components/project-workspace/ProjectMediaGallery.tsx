import { Camera, MapPin } from "lucide-react";
import type { ProjectMediaItem } from "@/lib/platform/media-types";
import { MEDIA_CATEGORY_LABELS, MEDIA_CATEGORY_COLORS } from "@/lib/platform/media-types";

interface ProjectMediaGalleryProps {
  items: ProjectMediaItem[];
  isLoading?: boolean;
}

export function ProjectMediaGallery({ items, isLoading }: ProjectMediaGalleryProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden animate-pulse">
            <div className="aspect-video bg-muted" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-3 py-16 bg-muted/10 text-muted-foreground">
        <Camera className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">Ingen billeder endnu</p>
        <p className="text-xs text-center max-w-xs">
          Upload feltfotos og drone-billeder for at dokumentere projektets tilstand.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function MediaCard({ item }: { item: ProjectMediaItem }) {
  const dateLabel = new Date(item.capturedAt ?? item.uploadedAt).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border bg-card overflow-hidden hover:shadow-sm transition group">
      <div className="aspect-video relative overflow-hidden bg-muted">
        <img
          src={item.thumbnailUrl ?? item.url}
          alt={item.title}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          loading="lazy"
        />
        {item.isReportReady && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500 text-white shadow-sm">
              Rapportklar
            </span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-tight line-clamp-2">{item.title}</p>
          <span
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${MEDIA_CATEGORY_COLORS[item.category]}`}
          >
            {MEDIA_CATEGORY_LABELS[item.category]}
          </span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{dateLabel}</span>
          {item.coordinates && (
            <span className="flex items-center gap-1 text-emerald-600">
              <MapPin className="h-3 w-3" />
              Georef.
            </span>
          )}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
