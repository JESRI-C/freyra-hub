import { lazy, Suspense, useState, type ReactNode } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { ManagerWorkOrder } from "@/lib/manager-work-orders";
import {
  currentPlanningDay,
  hasPlanningPeriod,
  plannedOnDay,
  planningDateLabel,
  planningWeek,
  shiftPlanningDay,
} from "@/lib/manager-work-order-planning";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PlanEditor = lazy(() =>
  import("./WorkOrderPlansPanel").then((module) => ({ default: module.WorkOrderPlansPanel })),
);
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";

export function ManagerWorkOrderPlanning({
  items,
  day,
  onDayChange,
  hasMore,
  renderOrder,
  onRefresh,
}: {
  items: ManagerWorkOrder[];
  day: string;
  onDayChange: (day: string) => void;
  hasMore: boolean;
  renderOrder: (task: ManagerWorkOrder) => ReactNode;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<ManagerWorkOrder | null>(null);
  const [editing, setEditing] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const days = planningWeek(day) ?? planningWeek(currentPlanningDay())!;
  const previous = shiftPlanningDay(days[0], -7);
  const next = shiftPlanningDay(days[0], 7);
  const withoutDates = items.filter((task) => !hasPlanningPeriod(task));
  const planned = items.filter((task) => days.some((date) => plannedOnDay(task, date)));
  function open(task: ManagerWorkOrder) {
    setEditing(false);
    setCloseBlocked(false);
    setSelected(task);
  }
  function close() {
    if (editing) {
      setCloseBlocked(true);
      return;
    }
    setSelected(null);
    setCloseBlocked(false);
    onRefresh();
  }
  function card(task: ManagerWorkOrder) {
    return (
      <div key={task.action_id} className="min-w-0 space-y-2">
        {renderOrder(task)}
        <button
          type="button"
          className={button + " w-full text-primary"}
          onClick={() => open(task)}
          aria-label={`Planlæg ${task.title} i ${task.project_name}`}
        >
          <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
          Planlæg
        </button>
      </div>
    );
  }
  return (
    <section aria-label="Ugeplan på tværs af sager" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">Planlæg arbejde</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sæt datoer og ansvar på opgaven uden at forlade ugeplanen.
          </p>
          <p className="mt-2 text-sm">
            {planningDateLabel(days[0])} – {planningDateLabel(days[6])} · {planned.length}{" "}
            forskellige opgaver i den viste uge
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className={button}
            aria-label="Forrige uge"
            disabled={!previous || !planningWeek(previous)}
            onClick={() => previous && onDayChange(previous)}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <label className="text-sm font-medium">
            Dato i ugen
            <input
              type="date"
              value={day}
              className="mt-1 block min-h-11 min-w-0 rounded-xl border bg-background px-3 py-2 text-base"
              onChange={(event) => {
                if (planningWeek(event.target.value)) onDayChange(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            className={button}
            aria-label="Næste uge"
            disabled={!next || !planningWeek(next)}
            onClick={() => next && onDayChange(next)}
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={button}
            onClick={() => onDayChange(currentPlanningDay())}
          >
            Denne uge
          </button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Opgaverne vises efter deres planlagte datoer. Eksporten følger filtrene ovenfor og medtager
        også opgaver i andre uger.
      </p>
      {hasMore && (
        <p
          role="status"
          className="rounded-xl border bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
        >
          Ugeplanen viser de indlæste opgaver. Hent flere arbejdsordrer for at få resten af det
          valgte udvalg med.
        </p>
      )}
      <div className="grid min-w-0 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {days.map((date) => {
          const orders = items.filter((task) => plannedOnDay(task, date));
          return (
            <section
              key={date}
              aria-label={`Plan for ${date}`}
              className="min-w-0 rounded-2xl border bg-muted/30"
            >
              <h3 className="rounded-t-2xl border-b px-4 py-3 text-sm font-semibold">
                {planningDateLabel(date)} · {orders.length} opgaver
              </h3>
              <div className="space-y-4 p-2">
                {orders.length ? (
                  orders.map(card)
                ) : (
                  <p className="p-3 text-sm text-muted-foreground">
                    Ingen indlæste opgaver på dagen.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <section
        aria-label="Opgaver uden fuld planperiode"
        className="min-w-0 rounded-2xl border bg-card p-4"
      >
        <h3 className="font-semibold">Datoer mangler · {withoutDates.length} opgaver</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Disse opgaver mangler en gyldig start- og slutdato. Begge datoer skal være fastlagt, før
          arbejdet kan placeres i ugeplanen.
        </p>
        <div className="mt-4 grid min-w-0 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {withoutDates.map(card)}
        </div>
      </section>
      <Sheet
        open={selected !== null}
        onOpenChange={(value) => {
          if (!value) close();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
          <SheetHeader>
            <SheetTitle>{selected ? `Planlæg · ${selected.title}` : "Planlæg arbejde"}</SheetTitle>
            <SheetDescription>
              {selected?.project_name}. Kontrollér arbejdsgrundlaget og gem ændringen som en ny
              plan.
            </SheetDescription>
          </SheetHeader>
          {closeBlocked && (
            <p role="alert" className="mt-4 rounded-xl border p-3 text-sm">
              Gem eller fortryd din kladde i formularen, før du lukker planlægningen.
            </p>
          )}
          {selected && (
            <div className="mt-5">
              <Suspense fallback={<p role="status">Henter opgavens arbejdsgrundlag…</p>}>
                <PlanEditor
                  key={`${selected.organization_id}:${selected.project_id}:${selected.action_id}`}
                  scope={{
                    organizationId: selected.organization_id,
                    projectId: selected.project_id,
                  }}
                  selectedActionId={selected.action_id}
                  onEditing={(value) => {
                    setEditing(value);
                    if (!value) setCloseBlocked(false);
                  }}
                />
              </Suspense>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
