import { CalendarDate } from "./action-execution";
import { z } from "zod";

export const RecurrenceInterval = z.enum(["daily", "weekly", "fortnightly", "monthly"]);
export type RecurrenceInterval = z.infer<typeof RecurrenceInterval>;

export function workOrderSeriesDates(
  firstDate: string,
  count: number,
  interval: RecurrenceInterval,
  sourceStart: string,
  sourceEnd: string | null,
) {
  if (
    !CalendarDate.safeParse(firstDate).success ||
    firstDate <= (sourceEnd ?? sourceStart) ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 12
  )
    return [];

  const duration = sourceEnd ? (Date.parse(sourceEnd) - Date.parse(sourceStart)) / 86_400_000 : 0;
  const dates = [];
  for (let index = 0; index < count; index++) {
    const start = new Date(firstDate + "T00:00:00Z");
    if (interval === "monthly") {
      const day = start.getUTCDate();
      const month = start.getUTCMonth() + index;
      start.setUTCMonth(month + 1, 0);
      start.setUTCDate(Math.min(day, start.getUTCDate()));
    } else {
      start.setUTCDate(
        start.getUTCDate() + index * { daily: 1, weekly: 7, fortnightly: 14 }[interval],
      );
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + duration);
    if (end.getUTCFullYear() > 9999) return [];
    dates.push({
      start: start.toISOString().slice(0, 10),
      end: sourceEnd ? end.toISOString().slice(0, 10) : null,
    });
  }
  return dates;
}

export const recurrenceLabels: Record<RecurrenceInterval, string> = {
  daily: "Hver dag",
  weekly: "Hver uge",
  fortnightly: "Hver anden uge",
  monthly: "Hver måned",
};
