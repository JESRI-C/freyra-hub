export function parseHourlyRateOre(value: string): number | null {
  const text = value.trim();
  if (!/^\d{1,6}(?:[,.]\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(/[,.]/);
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function billedLineOre(minutes: number, hourlyRateOre: number): number {
  // All amounts are nonnegative integers. Round each line to the nearest øre.
  return Math.floor((minutes * hourlyRateOre + 30) / 60);
}

export function billingDecimal(ore: number): string {
  return (ore / 100).toFixed(2).replace(".", ",");
}
