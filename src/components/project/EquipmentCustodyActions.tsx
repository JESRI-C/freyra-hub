import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { CalendarDate } from "@/lib/action-execution";
import type { ProjectScope } from "@/services/project-workspace-service";
import { EquipmentServiceJournal } from "./EquipmentServiceJournal";

const receipt = z.object({
  status: z.enum(["reserved", "checked_out", "returned"]),
  checked_out_at: z.string().datetime({ offset: true }).nullable(),
  returned_at: z.string().datetime({ offset: true }).nullable(),
  can_return: z.boolean(),
  holder_id: z.string().optional(),
  holder_name: z.string().nullable().optional(),
  can_offer_transfer: z.boolean().optional(),
  can_accept_transfer: z.boolean().optional(),
  transfers: z
    .array(
      z.object({
        from_name: z.string().nullable(),
        to_name: z.string().nullable(),
        accepted_at: z.string().datetime({ offset: true }),
        position: z
          .object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            accuracy_m: z.number().nonnegative().finite(),
          })
          .nullish(),
      }),
    )
    .default([]),
});
const transferCode = z.string().uuid();
const invitationReceipt = z.object({
  code: transferCode,
  expires_at: z.string().datetime({ offset: true }),
});
const availableReceipt = receipt.extend({
  reservation: z.object({
    name: z.string(),
    starts_on: CalendarDate,
    ends_on: CalendarDate,
    cancelled: z.boolean(),
    can_checkout: z.boolean(),
  }),
});
const formatTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });
const button = "min-h-11 rounded-lg border px-3 text-sm disabled:opacity-50";

export function EquipmentCustodyActions({
  bookingId,
  actionId,
  actorId,
  scope,
  disabled = false,
  showReservation = false,
}: {
  bookingId: string;
  actionId: string;
  actorId: string;
  scope: ProjectScope;
  disabled?: boolean;
  showReservation?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<z.infer<typeof invitationReceipt>>();
  const [code, setCode] = useState("");
  const attempt = useRef<{ operation: "checkout" | "return"; requestId: string } | null>(null);
  const args = {
    p_organization_id: scope.organizationId,
    p_project_id: scope.projectId,
    p_action_id: actionId,
    p_booking_id: bookingId,
  };
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const state = useQuery({
    queryKey: ["work-equipment-custody", actorId, scope, actionId, bookingId],
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await db().rpc("read_work_order_equipment_custody", args).abortSignal(signal);
      if (result.error) throw result.error;
      return availableReceipt.parse(result.data);
    },
  });
  async function transfer(operation: "offer" | "accept", sharePosition = false) {
    if (disabled || busy || state.isFetching) return;
    const cleanCode = code.trim();
    if (operation === "accept" && !transferCode.safeParse(cleanCode).success) {
      setError("Indtast hele overdragelseskoden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let position: GeolocationPosition | undefined;
      if (sharePosition) {
        try {
          position = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }),
          );
        } catch {
          setError(
            "Placeringen kunne ikke hentes. Giv adgang til placering, prøv igen eller modtag uden GPS.",
          );
          return;
        }
      }
      const result = await db().rpc("change_work_order_equipment_transfer", {
        ...args,
        p_operation: operation,
        p_code: operation === "accept" ? cleanCode : null,
        ...(position && {
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_accuracy_m: position.coords.accuracy,
        }),
      });
      if (result.error) throw result.error;
      if (operation === "offer") {
        setInvitation(invitationReceipt.parse(result.data));
      } else {
        receipt.parse(result.data);
        await state.refetch();
        setCode("");
      }
    } catch (failure) {
      setError(
        (failure as { code?: string })?.code === "42501"
          ? "Overdragelsen er ikke tilgængelig. Kontrollér jobkortet og kodens gyldighed."
          : "Overdragelsen kunne ikke bekræftes. Prøv igen.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function record(operation: "checkout" | "return") {
    if (disabled || busy || state.isFetching) return;
    setBusy(true);
    setError("");
    try {
      if (attempt.current?.operation !== operation) {
        attempt.current = { operation, requestId: crypto.randomUUID() };
      }
      const result = await db().rpc("change_work_order_equipment_custody", {
        ...args,
        p_operation: operation,
        p_request_id: attempt.current.requestId,
      });
      if (result.error) {
        if (result.error.code === "23505") setError("Udstyret er allerede udlånt.");
        else if (result.error.code === "22023")
          setError("Reservér udstyret til den aktuelle dag, og kontrollér udlånsstatus.");
        else setError("Registreringen kunne ikke gemmes. Kontrollér din adgang, og prøv igen.");
        return;
      }
      receipt.parse(result.data);
      await state.refetch();
      attempt.current = null;
    } catch {
      setError("Registreringen kunne ikke bekræftes. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  if (state.isPending) return <p role="status">Henter udlånsstatus…</p>;
  if (state.isError && (state.error as { code?: string })?.code === "42501")
    return <p role="status">Reservationen er ikke tilgængelig på denne opgave.</p>;
  if (state.isError)
    return (
      <button type="button" className={button} onClick={() => void state.refetch()}>
        Hent udlånsstatus igen
      </button>
    );
  const current = state.data;
  return (
    <div className="space-y-2">
      {showReservation && (
        <p className="font-semibold">
          {current.reservation.name} · {current.reservation.starts_on} til{" "}
          {current.reservation.ends_on}
        </p>
      )}
      {current.reservation.cancelled && <p>Reservationen er aflyst.</p>}
      {current.checked_out_at && (
        <p>Afhentet {formatTime.format(new Date(current.checked_out_at))}</p>
      )}
      {current.returned_at && <p>Afleveret {formatTime.format(new Date(current.returned_at))}</p>}
      {current.status === "checked_out" && current.holder_id && (
        <p>
          Hos {current.holder_id === actorId ? "dig" : (current.holder_name ?? "en medarbejder")}
        </p>
      )}
      {current.transfers.map((item, index) => (
        <p key={`${item.accepted_at}-${index}`}>
          Overdraget fra {item.from_name ?? "en medarbejder"} til {item.to_name ?? "en medarbejder"}
          {" · "}
          {formatTime.format(new Date(item.accepted_at))}
          {item.position && (
            <span className="block text-sm">
              Position {item.position.latitude.toFixed(5)}, {item.position.longitude.toFixed(5)}
              {" · "}nøjagtighed ±{Math.ceil(item.position.accuracy_m)} m
            </span>
          )}
        </p>
      ))}
      {((current.status === "reserved" && current.reservation.can_checkout) ||
        current.can_return) && (
        <button
          type="button"
          className={button}
          disabled={disabled || busy || state.isFetching}
          onClick={() => void record(current.status === "reserved" ? "checkout" : "return")}
        >
          {current.status === "reserved" ? "Registrér afhentning" : "Registrér aflevering"}
        </button>
      )}
      {current.status === "checked_out" && !current.can_return && (
        <p>Aflevering skal registreres af låneren eller projektlederen.</p>
      )}
      {current.can_offer_transfer && (
        <div className="space-y-2">
          <button
            type="button"
            className={button}
            disabled={disabled || busy || state.isFetching}
            onClick={() => void transfer("offer")}
          >
            Vis overdragelseskode
          </button>
          {invitation && (
            <label className="block text-sm">
              Giv koden til medarbejderen på samme job. Gyldig til{" "}
              {formatTime.format(new Date(invitation.expires_at))}.
              <input
                className="block w-full rounded border p-2"
                readOnly
                value={invitation.code}
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>
          )}
        </div>
      )}
      {current.can_accept_transfer && (
        <div className="space-y-2">
          <label className="block text-sm">
            Overdragelseskode
            <input
              className="block w-full rounded border p-2"
              value={code}
              disabled={disabled || busy}
              onChange={(event) => setCode(event.currentTarget.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className={button}
            disabled={disabled || busy || state.isFetching || !code.trim()}
            onClick={() => void transfer("accept")}
          >
            Modtag uden GPS
          </button>
          <button
            type="button"
            className={button + " ml-2"}
            disabled={disabled || busy || state.isFetching || !code.trim()}
            onClick={() => void transfer("accept", true)}
          >
            Modtag med GPS
          </button>
        </div>
      )}
      {current.status === "reserved" &&
        !current.reservation.can_checkout &&
        !current.reservation.cancelled && <p>Afhentning kan registreres i reservationsperioden.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function BookingCustodyDetails(props: Parameters<typeof EquipmentCustodyActions>[0]) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <details className="mt-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-2 font-medium">
          Afhentning og aflevering
        </summary>
        {open && <EquipmentCustodyActions {...props} />}
      </details>
      <EquipmentServiceJournal {...props} />
    </>
  );
}
