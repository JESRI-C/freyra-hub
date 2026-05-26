import { Download, FileJson, FileText, Send } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { GeoFeatureCollection } from "@/services/geospatial-service";

interface MapExportPanelProps {
  geoJSON: GeoFeatureCollection | null;
  projectName: string;
  className?: string;
}

function downloadJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MapExportPanel({ geoJSON, projectName, className }: MapExportPanelProps) {
  const slug = projectName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return (
    <Card className={className}>
      <CardHeader title="Eksport" subtitle="Download eller del geodata" />
      <div className="px-5 pb-5 space-y-2">
        <button
          onClick={() => {
            if (geoJSON) downloadJSON(geoJSON, `${slug}-geojson.json`);
          }}
          disabled={!geoJSON}
          className="w-full flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted/40 transition disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <FileJson className="h-4 w-4 text-primary shrink-0" />
          <div>
            <div className="font-medium">Download GeoJSON</div>
            <div className="text-xs text-muted-foreground">
              {geoJSON ? `${geoJSON.features.length} features` : "Indlæser…"}
            </div>
          </div>
          <Download className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        </button>

        <button
          onClick={() => {
            if (geoJSON) {
              const csv = [
                "id,feature_class,observation_type,value,unit,lng,lat",
                ...geoJSON.features
                  .filter((f) => f.geometry?.type === "Point")
                  .map((f) => {
                    const coords = f.geometry?.coordinates as [number, number] | undefined;
                    return [
                      f.id,
                      f.properties["feature_class"] ?? "",
                      f.properties["observation_type"] ?? "",
                      f.properties["value"] ?? "",
                      f.properties["unit"] ?? "",
                      coords?.[0] ?? "",
                      coords?.[1] ?? "",
                    ].join(",");
                  }),
              ].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${slug}-observationer.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }
          }}
          disabled={!geoJSON}
          className="w-full flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted/40 transition disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
          <div>
            <div className="font-medium">Download observationer (CSV)</div>
            <div className="text-xs text-muted-foreground">Punktdata med koordinater</div>
          </div>
          <Download className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
        </button>

        <button
          onClick={() => {
            // Mock: in production this would push data to the report module
            alert("Geodata sendt til rapportmodulet (mock)");
          }}
          className="w-full flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-muted/40 transition text-left"
        >
          <Send className="h-4 w-4 text-violet-600 shrink-0" />
          <div>
            <div className="font-medium">Send til rapportmodul</div>
            <div className="text-xs text-muted-foreground">Inkludér kortdata i næste rapport</div>
          </div>
        </button>
      </div>
    </Card>
  );
}
