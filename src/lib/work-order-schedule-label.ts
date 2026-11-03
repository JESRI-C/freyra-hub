export const scheduleDate = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeZone: "UTC",
});
export function scheduleLabel(plan?: { start: string | null; end: string | null }) {
  if (!plan?.start) return "Ingen planlagt dato";
  const start = scheduleDate.format(new Date(plan.start));
  return plan.end && plan.end !== plan.start
    ? start + " – " + scheduleDate.format(new Date(plan.end))
    : start;
}
