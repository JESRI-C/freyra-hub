import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  workEquipmentKind as kinds,
  workEquipmentKindLabel as kindLabel,
} from "@/lib/work-order-equipment";
import { CalendarDate } from "@/lib/action-execution";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import type { ProjectScope } from "@/services/project-workspace-service";
import { useWorkOrderEditorLock } from "./useWorkOrderEditorLock";

const uuid = z.string().uuid();
const equipmentSchema = z.object({ id: uuid, name: z.string(), kind: kinds });
const bookingSchema = z.object({
  id: uuid,
  starts_on: CalendarDate,
  ends_on: CalendarDate,
  cancelled_at: z.string().datetime({ offset: true }).nullable(),
  organization_work_equipment: equipmentSchema,
});
const equipmentTable = "organization_work_equipment";
const bookingTable = "work_order_equipment_bookings";
const bookingFields = "id,starts_on,ends_on,cancelled_at,organization_work_equipment(id,name,kind)";
const button = "min-h-11 rounded-xl border px-3 text-sm disabled:opacity-50";
const control = "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 text-base";

export function WorkOrderEquipmentBooking({
  scope,
  actorId,
  actionId,
  initialOpen = false,
  preview = false,
  plannedStart,
  plannedEnd,
  disabled,
  onEditing,
}: {
  scope: ProjectScope;
  actorId: string;
  actionId: string;
  initialOpen?: boolean;
  preview?: boolean;
  plannedStart: string | null;
  plannedEnd: string | null;
  disabled: boolean;
  onEditing?: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [newEquipment, setNewEquipment] = useState<{ name: string; kind: z.infer<typeof kinds> }>();
  const [draft, setDraft] = useState<
    { equipmentId: string; from: string; through: string } | undefined
  >(() =>
    preview && plannedStart
      ? { equipmentId: "", from: plannedStart, through: plannedEnd ?? plannedStart }
      : undefined,
  );
  const [cancelId, setCancelId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{ signature: string; id: string } | undefined>(undefined);
  useWorkOrderEditorLock(!preview && (!!newEquipment || !!draft || !!cancelId || busy), onEditing);
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const bookingsQuery = () =>
    db()
      .from(bookingTable)
      .select(bookingFields)
      .eq("organization_id", scope.organizationId)
      .eq("project_id", scope.projectId)
      .eq("action_id", actionId);
  const equipment = useQuery({
    queryKey: ["work-equipment", actorId, scope.organizationId, search],
    enabled: open && !!draft,
    retry: false,
    queryFn: async () => {
      const result = await db()
        .from(equipmentTable)
        .select("id,name,kind")
        .eq("organization_id", scope.organizationId)
        .ilike("name", "%" + search.trim() + "%")
        .order("name")
        .limit(100);
      if (result.error) throw new Error("Udstyrslisten kunne ikke hentes.");
      return z.array(equipmentSchema).parse(result.data);
    },
  });
  const [limit, setLimit] = useState(30);
  const bookings = useQuery({
    queryKey: ["equipment-bookings", actorId, scope, actionId, limit],
    enabled: open && !preview,
    retry: false,
    queryFn: async () => {
      const result = await bookingsQuery()
        .order("starts_on", { ascending: false })
        .order("id")
        .limit(limit + 1);
      if (result.error) throw new Error("Reservationerne kunne ikke hentes.");
      return z.array(bookingSchema).parse(result.data);
    },
  });

  const validBooking =
    !!draft &&
    uuid.safeParse(draft.equipmentId).success &&
    CalendarDate.safeParse(draft.from).success &&
    CalendarDate.safeParse(draft.through).success &&
    draft.from <= draft.through &&
    Date.parse(draft.through) - Date.parse(draft.from) <= 365 * 86400000;
  const availability = useQuery({
    queryKey: ["work-equipment-availability", actorId, scope, actionId, draft],
    enabled: open && validBooking && !disabled,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await db()
        .rpc("is_work_order_equipment_available", {
          p_organization_id: scope.organizationId,
          p_project_id: scope.projectId,
          p_action_id: actionId,
          p_equipment_id: draft?.equipmentId,
          p_starts_on: draft?.from,
          p_ends_on: draft?.through,
        })
        .abortSignal(signal);
      if (result.error) throw new Error("Ledigheden kunne ikke kontrolleres.");
      return z.boolean().parse(result.data);
    },
  });
  const signature = JSON.stringify([newEquipment, draft]);
  // An uncertain write may already have reserved the period. Keep its exact retry available.
  const knownConflict = availability.data === false && attempt.current?.signature !== signature;

  async function mutate() {
    if (preview || disabled || inFlight.current) return;
    const name = newEquipment?.name.trim();
    if (newEquipment && !name) {
      setError("Angiv et navn på udstyret.");
      return;
    }
    if (draft && !validBooking) {
      setError("Vælg udstyr og en gyldig periode på højst 366 dage.");
      return;
    }
    if (draft && knownConflict) return;
    if (!cancelId && !draft && !newEquipment) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (attempt.current?.signature !== signature)
        attempt.current = { signature, id: crypto.randomUUID() };
      const id = attempt.current.id;
      if (newEquipment && name) {
        const payload = {
          id,
          organization_id: scope.organizationId,
          source_project_id: scope.projectId,
          name,
          kind: newEquipment.kind,
        };
        const result = await db().from(equipmentTable).insert(payload).select("id").single();
        if (result.error || result.data?.id !== id) {
          const receipt = await db().from(equipmentTable).select("id").match(payload).maybeSingle();
          if (receipt.error || receipt.data?.id !== id)
            throw new Error(
              result.error?.code === "23505"
                ? "Navnet findes allerede i organisationens udstyrsliste."
                : "Udstyret kunne ikke bekræftes. Prøv igen.",
            );
        }
        setNewEquipment(undefined);
        setSearch("");
        setDraft({
          equipmentId: id,
          from: plannedStart ?? "",
          through: plannedEnd ?? plannedStart ?? "",
        });
        setMessage("Udstyret er oprettet. Vælg datoer for at reservere det.");
      } else if (draft) {
        const payload = {
          id,
          organization_id: scope.organizationId,
          project_id: scope.projectId,
          action_id: actionId,
          equipment_id: draft.equipmentId,
          starts_on: draft.from,
          ends_on: draft.through,
        };
        const result = await db().rpc("reserve_work_order_equipment", {
          p_id: id,
          p_organization_id: scope.organizationId,
          p_project_id: scope.projectId,
          p_action_id: actionId,
          p_equipment_id: draft.equipmentId,
          p_starts_on: draft.from,
          p_ends_on: draft.through,
        });
        if (result.error || result.data !== id) {
          const receipt = await bookingsQuery().match(payload).maybeSingle();
          if (result.error?.code === "23P01" && receipt.data?.id !== id) {
            attempt.current = undefined;
            void availability.refetch();
          }
          if (receipt.error || receipt.data?.id !== id)
            throw new Error(
              result.error?.code === "23P01"
                ? "Udstyret er allerede reserveret i en del af perioden. Vælg andre datoer eller andet udstyr."
                : "Reservationen kunne ikke bekræftes. Prøv igen.",
            );
        }
        setDraft(undefined);
        setMessage("Udstyret er reserveret.");
      } else if (cancelId) {
        await db()
          .from(bookingTable)
          .update({ cancelled_at: new Date().toISOString() })
          .eq("id", cancelId)
          .eq("organization_id", scope.organizationId)
          .eq("project_id", scope.projectId)
          .eq("action_id", actionId)
          .is("cancelled_at", null);
        const receipt = await bookingsQuery().eq("id", cancelId).maybeSingle();
        if (receipt.error || !receipt.data?.cancelled_at)
          throw new Error("Aflysningen kunne ikke bekræftes. Prøv igen.");
        setCancelId(undefined);
        setMessage("Reservationen er aflyst.");
      }
      attempt.current = undefined;
      void cache.invalidateQueries({ queryKey: ["project-equipment-bookings", actorId, scope] });
      void cache.invalidateQueries({ queryKey: ["work-equipment-availability", actorId] });
      await bookings.refetch();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Ændringen kunne ikke gemmes.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function clear() {
    setDraft(undefined);
    setNewEquipment(undefined);
    setCancelId(undefined);
    setError("");
    setMessage("");
    attempt.current = undefined;
  }
  const editing = !!draft || !!newEquipment || !!cancelId;
  return (
    <details
      className="space-y-3 rounded-xl border px-3 pb-3 text-sm"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="min-h-11 cursor-pointer py-3 font-medium">
        {preview ? "Kontrollér udstyr for datoforslaget" : "Booking af udstyr"}
      </summary>
      {preview ? (
        <p>
          Vælg udstyr for at se ledigheden fra {plannedStart} til {plannedEnd ?? plannedStart}.
        </p>
      ) : (
        <p>Reservér udstyr til denne opgave. Første og sidste dato er med i reservationen.</p>
      )}
      {!preview && open && bookings.isPending && <p role="status">Henter reservationer…</p>}
      {!preview && bookings.isError && (
        <button type="button" className={button} onClick={() => void bookings.refetch()}>
          Hent reservationer igen
        </button>
      )}
      {!preview && bookings.data?.length === 0 && <p>Opgaven har endnu ingen reservationer.</p>}
      {!preview && bookings.data && bookings.data.length > 0 && (
        <ul className="space-y-2">
          {bookings.data.slice(0, limit).map((row) => (
            <li key={row.id} className="space-y-2 rounded-lg border p-2">
              <p className="font-medium">
                {row.organization_work_equipment.name} ·{" "}
                {kindLabel[row.organization_work_equipment.kind]}
              </p>
              <p>
                {row.starts_on} til {row.ends_on} · {row.cancelled_at ? "Aflyst" : "Reserveret"}
              </p>
              {!row.cancelled_at && cancelId !== row.id && (
                <button
                  type="button"
                  className={button}
                  disabled={editing || busy || disabled}
                  onClick={() => {
                    clear();
                    setCancelId(row.id);
                  }}
                >
                  Aflys reservation
                </button>
              )}
              {cancelId === row.id && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={busy || disabled}
                    onClick={() => void mutate()}
                  >
                    Bekræft aflysning
                  </button>
                  <button type="button" className={button} disabled={busy} onClick={clear}>
                    Fortryd
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {!preview && !!bookings.data && bookings.data.length > limit && limit < 990 && (
        <button
          type="button"
          className={button}
          disabled={editing || busy}
          onClick={() => setLimit(limit + 30)}
        >
          Vis flere reservationer
        </button>
      )}
      {!preview && !editing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            disabled={busy || disabled}
            onClick={() => {
              clear();
              setDraft({
                equipmentId: "",
                from: plannedStart ?? "",
                through: plannedEnd ?? plannedStart ?? "",
              });
            }}
          >
            Reservér udstyr
          </button>
          <button
            type="button"
            className={button}
            disabled={busy || disabled}
            onClick={() => {
              clear();
              setNewEquipment({ name: "", kind: "machine" });
            }}
          >
            Tilføj udstyr til organisationen
          </button>
        </div>
      )}
      {(!preview || open) && (draft || newEquipment) && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void mutate();
          }}
        >
          <fieldset disabled={busy || disabled} className="space-y-2">
            {newEquipment && (
              <>
                <label className="block">
                  Udstyrets navn
                  <input
                    className={control}
                    required
                    maxLength={120}
                    value={newEquipment.name}
                    onChange={(event) =>
                      setNewEquipment({ ...newEquipment, name: event.target.value })
                    }
                  />
                </label>
                <label className="block">
                  Udstyrstype
                  <select
                    className={control}
                    value={newEquipment.kind}
                    onChange={(event) =>
                      setNewEquipment({ ...newEquipment, kind: kinds.parse(event.target.value) })
                    }
                  >
                    {kinds.options.map((kind) => (
                      <option key={kind} value={kind}>
                        {kindLabel[kind]}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {draft && (
              <>
                <label className="block">
                  Søg i organisationens udstyr
                  <input
                    className={control}
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setDraft({ ...draft, equipmentId: "" });
                    }}
                  />
                </label>
                <label className="block">
                  {preview ? "Udstyr til ledighedskontrol" : "Udstyr til reservation"}
                  <select
                    className={control}
                    required
                    value={draft.equipmentId}
                    onChange={(event) => setDraft({ ...draft, equipmentId: event.target.value })}
                  >
                    <option value="">Vælg udstyr</option>
                    {equipment.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {kindLabel[item.kind]}
                      </option>
                    ))}
                  </select>
                </label>
                {equipment.isPending && <p role="status">Henter udstyr…</p>}
                {equipment.isError && (
                  <button type="button" className={button} onClick={() => void equipment.refetch()}>
                    Hent udstyr igen
                  </button>
                )}
                {equipment.data?.length === 0 && <p>Ingen udstyr matcher søgningen.</p>}
                {!preview && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      Fra dato
                      <input
                        type="date"
                        className={control}
                        required
                        value={draft.from}
                        onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                      />
                    </label>
                    <label className="block">
                      Til og med
                      <input
                        type="date"
                        className={control}
                        required
                        value={draft.through}
                        onChange={(event) => setDraft({ ...draft, through: event.target.value })}
                      />
                    </label>
                  </div>
                )}
              </>
            )}
            {draft && validBooking && (
              <div className="space-y-1 rounded-lg bg-muted/40 p-2">
                <p role="status">
                  {availability.isFetching || availability.isPending
                    ? "Kontrollerer ledighed…"
                    : availability.isError
                      ? preview
                        ? "Ledigheden kunne ikke kontrolleres."
                        : "Ledigheden kunne ikke kontrolleres. Freyra kontrollerer igen ved gemning."
                      : availability.data === false
                        ? "Optaget i den valgte periode. Vælg andre datoer eller andet udstyr."
                        : preview
                          ? "Ledigt ved seneste kontrol."
                          : "Ledigt ved seneste kontrol. Reservationen bekræftes, når du gemmer."}
                </p>
                {!availability.isFetching &&
                  (availability.data === false || availability.isError) && (
                    <button
                      type="button"
                      className={button}
                      onClick={() => void availability.refetch()}
                    >
                      Tjek ledighed igen
                    </button>
                  )}
              </div>
            )}
            {!preview && (
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={button} disabled={!!draft && knownConflict}>
                  {busy ? "Gemmer…" : draft ? "Gem reservation" : "Gem udstyr"}
                </button>
                <button type="button" className={button} onClick={clear}>
                  Fortryd
                </button>
              </div>
            )}
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
