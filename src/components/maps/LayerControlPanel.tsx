import { Layers, Eye, EyeOff, Leaf, Satellite, Radio, Mountain, Waves } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { MapLayer } from "@/services/geospatial-service";

interface LayerControlPanelProps {
  layers: MapLayer[];
  visibleSlugs: Set<string>;
  onToggle: (slug: string) => void;
  className?: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  nature: <Leaf className="h-3.5 w-3.5" />,
  satellite: <Satellite className="h-3.5 w-3.5" />,
  sensors: <Radio className="h-3.5 w-3.5" />,
  terrain: <Mountain className="h-3.5 w-3.5" />,
  water: <Waves className="h-3.5 w-3.5" />,
};

const CATEGORY_COLOR: Record<string, string> = {
  nature: "bg-emerald-100 text-emerald-700",
  satellite: "bg-violet-100 text-violet-700",
  sensors: "bg-blue-100 text-blue-700",
  terrain: "bg-amber-100 text-amber-700",
  water: "bg-cyan-100 text-cyan-700",
};

const STATUS_DOT: Record<string, string> = {
  live: "bg-emerald-500",
  preview: "bg-amber-400",
  unavailable: "bg-red-400",
};

export function LayerControlPanel({
  layers,
  visibleSlugs,
  onToggle,
  className,
}: LayerControlPanelProps) {
  return (
    <Card className={className}>
      <CardHeader
        title="Kortlag"
        subtitle={`${visibleSlugs.size} af ${layers.length} lag aktive`}
        action={<Layers className="h-4 w-4 text-muted-foreground" />}
      />
      <div className="px-5 pb-4 divide-y">
        {layers.map((layer) => {
          const visible = visibleSlugs.has(layer.slug);
          return (
            <div
              key={layer.slug}
              className="py-3 flex items-center gap-3"
            >
              {/* Category icon */}
              <span
                className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${CATEGORY_COLOR[layer.category] ?? "bg-muted text-muted-foreground"}`}
              >
                {CATEGORY_ICONS[layer.category]}
              </span>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{layer.name}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[layer.status]}`} />
                  <span className="text-[11px] text-muted-foreground">
                    {layer.provider ?? layer.category}
                    {layer.requiresApiKey && " · kræver nøgle"}
                  </span>
                </div>
              </div>

              {/* Toggle */}
              <button
                onClick={() => onToggle(layer.slug)}
                aria-label={visible ? `Skjul ${layer.name}` : `Vis ${layer.name}`}
                className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                  visible
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
