import { MapPin } from "lucide-react";
import { Card, CardHeader } from "@/components/ui-bits";
import type { NatureContext } from "@/lib/supabase/types";

interface Props {
  ctx: NatureContext | null;
}

function Row({ label, value }: { label: string; value: string | number | boolean | null | undefined }) {
  const display =
    value === null || value === undefined
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Ja"
          : "Nej"
        : String(value);

  return (
    <div className="flex items-start justify-between py-2 border-b last:border-0 gap-4">
      <span className="text-sm text-muted-foreground shrink-0 w-52">{label}</span>
      <span className="text-sm font-medium text-right">{display}</span>
    </div>
  );
}

export function NatureContextPanel({ ctx }: Props) {
  if (!ctx) {
    return (
      <Card className="py-12 text-center">
        <CardHeader
          title="Ingen naturbeskrivelse registreret"
          subtitle="Udfyld naturbeskrivelse for at dokumentere projektets kontekst ift. natur og vand."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Naturkontekst" subtitle="Projektets omgivende naturtyper og afstande" />
        <div className="px-5 pb-4">
          <Row label="Tilstødende naturtype" value={ctx.adjacent_nature_type} />
          <Row label="Vandløb til stede" value={ctx.watercourse_present} />
          {ctx.watercourse_present && (
            <>
              <Row label="Vandløbsnavn" value={ctx.watercourse_name} />
              <Row
                label="Afstand til vandløb"
                value={ctx.distance_to_watercourse_m != null ? `${ctx.distance_to_watercourse_m} m` : null}
              />
            </>
          )}
          <Row label="Beskyttet natur (§3)" value={ctx.protected_nature_present} />
          {ctx.protected_nature_present && (
            <Row label="Beskyttet naturtype" value={ctx.protected_nature_type} />
          )}
          <Row label="Natura 2000 i nærheden" value={ctx.natura2000_nearby} />
          {ctx.natura2000_nearby && (
            <Row
              label="Afstand til Natura 2000"
              value={ctx.distance_to_natura2000_m != null ? `${ctx.distance_to_natura2000_m} m` : null}
            />
          )}
          {ctx.buffer_zone_m != null && (
            <Row label="Bufferkrav" value={`${ctx.buffer_zone_m} m`} />
          )}
          <Row label="Terræn og hældning" value={ctx.terrain_slope_description} />
          <Row label="Følsomme receptorer" value={ctx.sensitive_receptors} />
        </div>
      </Card>

      {/* Map placeholder */}
      <Card className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <MapPin className="h-4 w-4" />
          <span className="text-sm font-medium">Kortintegration</span>
        </div>
        <div className="h-40 rounded-xl bg-muted/50 border border-dashed flex items-center justify-center text-sm text-muted-foreground">
          Kortintegration planlagt — visualisering af naturzoner og buffere
        </div>
      </Card>
    </div>
  );
}
