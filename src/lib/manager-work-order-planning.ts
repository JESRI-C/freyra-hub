import type { ManagerWorkOrder } from "./manager-work-orders";

export function calendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function shiftPlanningDay(value: string, days: number): string | null {
  if (!calendarDay(value) || !Number.isInteger(days)) return null;
  const date = new Date(value + "T12:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + days);
  if (!Number.isFinite(date.getTime())) return null;
  const shifted = date.toISOString().slice(0, 10);
  return calendarDay(shifted) ? shifted : null;
}

export function planningWeek(value: string): string[] | null {
  if (!calendarDay(value)) return null;
  const weekday = new Date(value + "T12:00:00.000Z").getUTCDay();
  const monday = shiftPlanningDay(value, -((weekday + 6) % 7));
  if (!monday) return null;
  const days = Array.from({ length: 7 }, (_, i) => shiftPlanningDay(monday, i));
  return days.every((day): day is string => day !== null) ? days : null;
}

export function currentPlanningDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function planningDateLabel(value: string): string {
  return new Intl.DateTimeFormat("da-DK", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value + "T12:00:00.000Z"));
}

type PlannedOrder = Pick<ManagerWorkOrder, "planned_start" | "planned_end">;

/** A deadline or a partially known interval must never invent planned work. */
export function hasPlanningPeriod(task: PlannedOrder): boolean {
  return (
    !!task.planned_start &&
    !!task.planned_end &&
    calendarDay(task.planned_start) &&
    calendarDay(task.planned_end) &&
    task.planned_start <= task.planned_end
  );
}

export function plannedOnDay(task: PlannedOrder, day: string): boolean {
  return (
    hasPlanningPeriod(task) &&
    calendarDay(day) &&
    task.planned_start! <= day &&
    task.planned_end! >= day
  );
}
