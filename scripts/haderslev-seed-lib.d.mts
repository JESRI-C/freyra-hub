export const CORE_POINTS: Readonly<Record<string, string>>;
export const CASE_NAME: string;
export const FLIGHT_DATE: string;
export function stableUuid(value: string): string;
export function validateSeedMetadata(
  metadata: Record<string, unknown>,
  dimensions: { width: number; height: number },
): {
  model: string;
  date: string;
  latitude: number;
  longitude: number;
  width: number;
  height: number;
};
export function jpegDimensions(bytes: Buffer): { width: number; height: number };
export function assertStagingTarget(url: string, expectedRef: string): void;
