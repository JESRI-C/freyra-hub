import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createActorBoundSupabaseClient } from "@/lib/supabase/client";
import { CalendarDate } from "@/lib/action-execution";
import { buildCsv, downloadProjectCsv } from "@/services/export-service";
import { suggestGpsTrips } from "@/lib/gps-trip-suggestions";
import { GpsTripHistory } from "./GpsTripHistory";
import type { GpsHistoryPoint } from "./GpsDeviceOverview";

const classificationSchema = z.enum(["private", "business"]);
const time = z.string().datetime({ offset: true });
const distanceSnapshot = {
  gps_distance_m: z.number().int().nonnegative().nullable(),
  gps_sample_count: z.number().int().nonnegative().nullable(),
  gps_gap_count: z.number().int().nonnegative().nullable(),
};
const tripList = z.array(
  z.object({
    id: z.string().uuid(),
    driver_id: z.string().uuid(),
    started_at: time,
    ended_at: time,
    classification: classificationSchema,
    purpose: z.string().nullable(),
    approved_at: time.nullish(),
    revision: z.number().int().positive(),
    ...distanceSnapshot,
  }),
);
const approvedTrips = z
  .array(
    z.object({
      id: z.string().uuid(),
      driver_id: z.string().uuid(),
      started_at: time,
      ended_at: time,
      purpose: z.string(),
      approved_at: time,
      approved_by: z.string().uuid(),
      ...distanceSnapshot,
    }),
  )
  .max(1000);
const dateTime = new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" });
const kilometres = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 });
const formatTime = (value: string) => dateTime.format(new Date(value));
const control = "mt-1 block min-h-11 w-full rounded border bg-background px-2";
const button = "min-h-11 rounded border px-3 disabled:opacity-50";
const calendar = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const exportColumns = [
  "Tur",
  "Fører",
  "Start",
  "Slut",
  "Formål",
  "GPS-meter",
  "GPS-punkter",
  "GPS-målehuller",
  "Godkendt",
  "Godkendt af",
];

export function GpsTripLog({
  actorId,
  projectId,
  deviceId,
  points,
}: {
  actorId: string;
  projectId: string;
  deviceId: string;
  points: GpsHistoryPoint[];
}) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [classification, setClassification] =
    useState<z.infer<typeof classificationSchema>>("business");
  const [purpose, setPurpose] = useState("");
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [saved, setSaved] = useState(false);
  const [through, setThrough] = useState(() => calendar.format(new Date()));
  const [from, setFrom] = useState(() => through.slice(0, 7) + "-01");
  const [feedback, setFeedback] = useState("");
  const [amendment, setAmendment] = useState<{
    id: string;
    revision: number;
    classification: z.infer<typeof classificationSchema>;
    purpose: string;
  }>();
  const writing = useRef(false);
  const retry = useRef<{ signature: string; id: string } | undefined>(undefined);
  const db = () => createActorBoundSupabaseClient(actorId) as unknown as SupabaseClient;
  const canReview = useQuery({
    queryKey: ["gps-trip-review-access", actorId, projectId],
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await db()
        .rpc("can_review_gps_trips", { p_project_id: projectId })
        .abortSignal(signal);
      if (result.error) throw result.error;
      return z.boolean().parse(result.data);
    },
  });
  const trips = useQuery({
    queryKey: ["gps-trip-log", actorId, projectId, deviceId, limit],
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await db()
        .from("gps_trip_log")
        .select(
          "id,driver_id,started_at,ended_at,classification,purpose,approved_at,revision,gps_distance_m,gps_sample_count,gps_gap_count",
        )
        .eq("project_id", projectId)
        .eq("device_id", deviceId)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1)
        .abortSignal(signal);
      if (result.error) throw result.error;
      return tripList.parse(result.data);
    },
  });
  const first = points.find((point) => point.id === start);
  const last = points.find((point) => point.id === end);
  const suggestions = useMemo(() => {
    const booked = (trips.data ?? []).filter((trip) => trip.driver_id === actorId);
    return suggestGpsTrips(points).filter(
      ({ start, end }) =>
        !booked.some(
          (trip) =>
            Date.parse(trip.started_at) < end.time && Date.parse(trip.ended_at) > start.time,
        ),
    );
  }, [actorId, points, trips.data]);
  const valid =
    first &&
    last &&
    Date.parse(first.measured_at) < Date.parse(last.measured_at) &&
    (classification === "private" || purpose.trim().length > 0);
  const validPeriod =
    CalendarDate.safeParse(from).success &&
    CalendarDate.safeParse(through).success &&
    from <= through &&
    Date.parse(through) - Date.parse(from) <= 365 * 86_400_000;
  const manager = canReview.isSuccess && canReview.data;

  async function approve(tripId: string, revision: number) {
    if (!manager || writing.current) return;
    writing.current = true;
    setBusy(true);
    setProblem("");
    setFeedback("");
    try {
      const result = await db().rpc("approve_gps_trip", {
        p_project_id: projectId,
        p_device_id: deviceId,
        p_trip_id: tripId,
        p_revision: revision,
      });
      if (result.error?.code === "PT409" || result.error?.code === "42501") {
        await trips.refetch();
        setProblem("Turen eller adgangen er ændret. Kontrollér den aktuelle kørebog.");
        return;
      }
      if (result.error) throw result.error;
      time.parse(result.data);
      await trips.refetch();
      setFeedback("Erhvervsturen er godkendt.");
    } catch {
      setProblem("Godkendelsen kunne ikke bekræftes. Prøv igen.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  async function amend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!amendment || writing.current) return;
    const revisedPurpose =
      amendment.classification === "business" ? amendment.purpose.trim() : null;
    if (amendment.classification === "business" && !revisedPurpose) return;
    writing.current = true;
    setBusy(true);
    setProblem("");
    setFeedback("");
    try {
      const result = await db().rpc("amend_gps_trip", {
        p_project_id: projectId,
        p_device_id: deviceId,
        p_trip_id: amendment.id,
        p_revision: amendment.revision,
        p_classification: amendment.classification,
        p_purpose: revisedPurpose,
      });
      if (result.error?.code === "PT409" || result.error?.code === "42501") {
        await trips.refetch();
        setAmendment(undefined);
        setProblem("Turen er ændret eller godkendt. Kontrollér den aktuelle kørebog.");
        return;
      }
      if (result.error) throw result.error;
      z.number().int().positive().parse(result.data);
      setAmendment(undefined);
      await trips.refetch();
      setFeedback("Rettelsen er gemt.");
    } catch {
      setProblem("Rettelsen kunne ikke bekræftes. Prøv igen.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  async function exportTrips() {
    if (!manager || !validPeriod || writing.current) return;
    writing.current = true;
    setBusy(true);
    setProblem("");
    setFeedback("");
    try {
      const result = await db().rpc("export_approved_gps_trips", {
        p_project_id: projectId,
        p_device_id: deviceId,
        p_from: from,
        p_through: through,
      });
      if (result.error) {
        setProblem(
          result.error.code === "54000"
            ? "Vælg en kortere periode med højst 1.000 ture."
            : "De godkendte ture kunne ikke hentes.",
        );
        return;
      }
      const rows = approvedTrips.parse(result.data);
      if (!rows.length) {
        setFeedback("Der er ingen godkendte erhvervsture i perioden.");
        return;
      }
      await downloadProjectCsv(
        buildCsv(
          rows.map((trip) => ({
            Tur: trip.id,
            Fører: trip.driver_id,
            Start: trip.started_at,
            Slut: trip.ended_at,
            Formål: trip.purpose.trim().replace(/\r\n?/g, "\n"),
            "GPS-meter": trip.gps_distance_m,
            "GPS-punkter": trip.gps_sample_count,
            "GPS-målehuller": trip.gps_gap_count,
            Godkendt: trip.approved_at,
            "Godkendt af": trip.approved_by,
          })),
          exportColumns,
        ),
        "koerebog-" + from + "-" + through + ".csv",
        { projectId, entityType: "monitoring_device", entityId: deviceId },
      );
      setFeedback("CSV-filen er hentet.");
    } catch {
      setProblem("CSV-filen kunne ikke hentes.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || writing.current) return;
    const args = {
      p_project_id: projectId,
      p_device_id: deviceId,
      p_start_id: start,
      p_end_id: end,
      p_classification: classification,
      p_purpose: classification === "business" ? purpose.trim() : null,
    };
    const signature = JSON.stringify(args);
    if (retry.current?.signature !== signature)
      retry.current = { signature, id: crypto.randomUUID() };
    writing.current = true;
    setBusy(true);
    setProblem("");
    setFeedback("");
    setSaved(false);
    try {
      const result = await db().rpc("record_gps_trip", { ...args, p_id: retry.current.id });
      if (result.error) {
        setProblem(
          result.error.code === "23P01"
            ? "Turen overlapper en af dine gemte ture på trackeren."
            : "Turen kunne ikke gemmes. Kontrollér målepunkterne og din adgang.",
        );
        return;
      }
      if (result.data !== retry.current.id) throw new Error("Unexpected trip receipt");
      retry.current = undefined;
      setStart("");
      setEnd("");
      setPurpose("");
      setSaved(true);
      await trips.refetch();
    } catch {
      setProblem("Turen kunne ikke bekræftes. Prøv igen.");
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  return (
    <section aria-label="Kørebog" className="space-y-2 rounded-lg border p-2">
      <h3 className="font-semibold">Kørebog</h3>
      {points.length < 2 && (
        <p className="text-sm">
          Åbn GPS-historikken med mindst to målepunkter for at registrere en tur.
        </p>
      )}
      {points.length > 1 && (
        <form className="space-y-2" onSubmit={(event) => void save(event)}>
          <fieldset disabled={busy} className="space-y-2">
            <legend className="font-medium">Registrér en tur</legend>
            {!!suggestions.length && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Turforslag fra de indlæste GPS-punkter</p>
                <ul className="space-y-1">
                  {suggestions.map((trip) => (
                    <li key={trip.start.id + ":" + trip.end.id}>
                      <button
                        type="button"
                        className={button + " text-left text-sm aria-pressed:bg-muted"}
                        aria-pressed={start === trip.start.id && end === trip.end.id}
                        onClick={() => {
                          setStart(trip.start.id);
                          setEnd(trip.end.id);
                          setSaved(false);
                          setProblem("");
                        }}
                      >
                        {formatTime(trip.start.measured_at)} til {formatTime(trip.end.measured_at)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <label className="block text-sm">
              Start
              <select
                className={control}
                value={start}
                onChange={(event) => setStart(event.target.value)}
              >
                <option value="">Vælg startpunkt</option>
                {points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {formatTime(point.measured_at)} · {point.latitude.toFixed(4)},{" "}
                    {point.longitude.toFixed(4)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Slut
              <select
                className={control}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              >
                <option value="">Vælg slutpunkt</option>
                {points.map((point) => (
                  <option key={point.id} value={point.id}>
                    {formatTime(point.measured_at)} · {point.latitude.toFixed(4)},{" "}
                    {point.longitude.toFixed(4)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Kørsel
              <select
                className={control}
                value={classification}
                onChange={(event) =>
                  setClassification(classificationSchema.parse(event.target.value))
                }
              >
                <option value="business">Erhverv</option>
                <option value="private">Privat</option>
              </select>
            </label>
            {classification === "business" && (
              <label className="block text-sm">
                Formål
                <input
                  className={control}
                  maxLength={500}
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
            )}
            {first && last && Date.parse(first.measured_at) >= Date.parse(last.measured_at) && (
              <p>Vælg et slutpunkt efter startpunktet.</p>
            )}
            <button type="submit" className={button} disabled={!valid || busy}>
              {busy ? "Gemmer…" : "Gem tur"}
            </button>
          </fieldset>
        </form>
      )}
      {problem && <p role="alert">{problem}</p>}
      {saved && <p role="status">Turen er gemt.</p>}
      {feedback && <p role="status">{feedback}</p>}
      {trips.isPending && <p role="status">Henter ture…</p>}
      {trips.isError && (
        <p role="alert">
          Ture kunne ikke hentes.{" "}
          <button className={button} type="button" onClick={() => void trips.refetch()}>
            Prøv igen
          </button>
        </p>
      )}
      {trips.isSuccess &&
        (!trips.data.length ? (
          <p>Ingen registrerede ture.</p>
        ) : (
          <ul className="divide-y">
            {trips.data.slice(0, limit).map((trip) => (
              <li key={trip.id} className="break-words py-2">
                <p className="font-medium">
                  {trip.classification === "business" ? "Erhverv" : "Privat"}
                  {trip.purpose && " · " + trip.purpose}
                </p>
                <p>
                  {formatTime(trip.started_at)} til {formatTime(trip.ended_at)}
                </p>
                <p className="text-sm">
                  {trip.gps_distance_m === null
                    ? "GPS-distance kan ikke beregnes"
                    : "Beregnet GPS-distance · " +
                      kilometres.format(trip.gps_distance_m / 1000) +
                      " km"}
                  {!!trip.gps_gap_count && " · Målehuller udeladt"}
                </p>
                {trip.classification === "business" &&
                  (trip.approved_at ? (
                    <p>Godkendt {formatTime(trip.approved_at)}</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <p>Afventer godkendelse</p>
                      {manager && (
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() => void approve(trip.id, trip.revision)}
                        >
                          Godkend erhvervstur
                        </button>
                      )}
                    </div>
                  ))}
                {trip.driver_id === actorId && (
                  <GpsTripHistory tripId={trip.id} actorId={actorId} revision={trip.revision} />
                )}
                {trip.driver_id === actorId &&
                  !trip.approved_at &&
                  (amendment?.id === trip.id ? (
                    <form aria-label="Ret tur" onSubmit={(event) => void amend(event)}>
                      <fieldset className="space-y-2" disabled={busy}>
                        <label className="block text-sm">
                          Ret klassificering
                          <select
                            className={control}
                            value={amendment.classification}
                            onChange={(event) =>
                              setAmendment({
                                ...amendment,
                                classification: classificationSchema.parse(event.target.value),
                              })
                            }
                          >
                            <option value="business">Erhverv</option>
                            <option value="private">Privat</option>
                          </select>
                        </label>
                        {amendment.classification === "business" && (
                          <label className="block text-sm">
                            Ret formål
                            <input
                              className={control}
                              maxLength={500}
                              value={amendment.purpose}
                              onChange={(event) =>
                                setAmendment({ ...amendment, purpose: event.target.value })
                              }
                            />
                          </label>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <button
                            className={button}
                            type="submit"
                            disabled={
                              amendment.classification === "business" && !amendment.purpose.trim()
                            }
                          >
                            Gem rettelse
                          </button>
                          <button
                            className={button}
                            type="button"
                            onClick={() => setAmendment(undefined)}
                          >
                            Annullér
                          </button>
                        </div>
                      </fieldset>
                    </form>
                  ) : (
                    <button
                      className={button}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setAmendment({
                          id: trip.id,
                          revision: trip.revision,
                          classification: trip.classification,
                          purpose: trip.purpose ?? "",
                        })
                      }
                    >
                      Ret tur
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        ))}
      {trips.isSuccess && trips.data.length > limit && (
        <button type="button" className={button} onClick={() => setLimit(limit + 20)}>
          Vis flere ture
        </button>
      )}
      {manager && (
        <fieldset className="space-y-2 rounded border p-2" disabled={busy}>
          <legend className="font-medium">Eksportér godkendte erhvervsture</legend>
          <label className="block text-sm">
            Fra dato
            <input
              className={control}
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Til og med
            <input
              className={control}
              type="date"
              value={through}
              onChange={(event) => setThrough(event.target.value)}
            />
          </label>
          <button
            type="button"
            className={button}
            disabled={!validPeriod || busy}
            onClick={() => void exportTrips()}
          >
            Hent CSV
          </button>
        </fieldset>
      )}
    </section>
  );
}
