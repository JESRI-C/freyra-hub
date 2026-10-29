import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/supabase/client";
import { FieldPhotoReceiptSchema, FieldPhotoUuid } from "@/lib/field-photo-upload";
import { verifyFieldPhoto } from "@/lib/field-photo-verification.functions";
import { Button } from "@/components/ui/button";

/** Remounted by actor/photo, so an old verification cannot update a new selection. */
export function FieldPhotoReceiptPanel({
  projectId,
  uploadId,
  actorId,
  canContribute,
}: {
  projectId: string;
  uploadId: string;
  actorId: string;
  canContribute: boolean;
}) {
  const verify = useServerFn(verifyFieldPhoto),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const receipt = useQuery({
    queryKey: ["field-photo-receipt", projectId, uploadId, actorId],
    retry: false,
    queryFn: async () => {
      FieldPhotoUuid.parse(projectId);
      FieldPhotoUuid.parse(uploadId);
      if (!supabase) throw new Error("Databasen er ikke konfigureret.");
      const db = supabase as unknown as {
        from(table: string): {
          select(columns: string): {
            eq(
              column: string,
              value: string,
            ): {
              eq(
                column: string,
                value: string,
              ): { maybeSingle(): Promise<{ data: unknown; error: unknown }> };
            };
          };
        };
      };
      const result = await db
        .from("field_photo_receipts")
        .select("*")
        .eq("project_id", projectId)
        .eq("upload_id", uploadId)
        .maybeSingle();
      if (result.error) throw new Error("Serverkvitteringen kunne ikke læses.");
      if (!result.data) return null;
      const value = FieldPhotoReceiptSchema.parse(result.data);
      if (value.project_id !== projectId || value.upload_id !== uploadId)
        throw new Error("Serverkvitteringen har forkert projekt eller foto.");
      return value;
    },
  });
  async function run() {
    setBusy(true);
    setError("");
    try {
      await verify({ data: { projectId, uploadId } });
      if (alive.current) await receipt.refetch();
    } catch {
      if (alive.current)
        setError("Kontrollen kunne ikke afsluttes. Originalen bliver liggende; prøv igen om lidt.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="rounded border p-3 text-sm space-y-2" aria-label="Serverkontrol af originalfil">
      {receipt.isPending ? (
        <p>Henter serverkvittering…</p>
      ) : receipt.error ? (
        <p role="alert">{receipt.error.message}</p>
      ) : receipt.data ? (
        <>
          <p>
            {receipt.data.status === "verified"
              ? "Serverens checksum matcher den indsendte original."
              : "Checksum stemmer ikke. Behold din original; uploaden kræver afklaring."}
          </p>
          <p className="break-all">SHA-256: {receipt.data.sha256}</p>
          <p>
            Kontrolleret {new Date(receipt.data.verified_at).toLocaleString("da-DK")}. Kontrollen
            vedrører filens bytes; GPS og fagligt indhold kræver særskilt vurdering.
          </p>
        </>
      ) : (
        <>
          <p>Originalen er modtaget. Serverkontrollen mangler.</p>
          {canContribute && (
            <Button variant="outline" disabled={busy} onClick={() => void run()}>
              {busy ? "Kontrollerer original…" : "Kontrollér originalfil på serveren"}
            </Button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
