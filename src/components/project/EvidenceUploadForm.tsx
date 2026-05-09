import { Upload, Info } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/client";

interface EvidenceUploadFormProps {
  projectId: string;
}

export function EvidenceUploadForm({ projectId: _projectId }: EvidenceUploadFormProps) {
  if (!isSupabaseConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-muted-foreground/30 p-6 text-center space-y-2">
        <Info className="h-5 w-5 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Upload af dokumentation kræver Supabase Storage-konfiguration.
        </p>
        <p className="text-xs text-muted-foreground">
          Tilføj <code className="bg-muted px-1 rounded">VITE_SUPABASE_URL</code> og{" "}
          <code className="bg-muted px-1 rounded">VITE_SUPABASE_ANON_KEY</code> for at aktivere
          upload.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-primary/40 p-6 text-center space-y-3">
      <Upload className="h-6 w-6 text-primary mx-auto" />
      <p className="text-sm font-medium">Upload dokumentation</p>
      <p className="text-xs text-muted-foreground">PDF, TIFF, GeoTIFF eller billedfiler</p>
      <label className="inline-block cursor-pointer">
        <input type="file" className="sr-only" accept=".pdf,.tif,.tiff,.jpg,.jpeg,.png" />
        <span className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90 transition-colors">
          <Upload className="h-4 w-4" /> Vælg fil
        </span>
      </label>
    </div>
  );
}
