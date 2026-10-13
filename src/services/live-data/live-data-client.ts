import type { ProjectGeometry } from "@/lib/supabase/types";

export type ConnectorMode = "live" | "preview" | "error";
export type ConnectorStatus =
  | "ok"
  | "error"
  | "missing_key"
  | "timeout"
  | "disabled"
  | "invalid_geometry"
  | "no_coverage";

export interface ConnectorResponse<T> {
  data: T | null;
  mode: ConnectorMode;
  status: ConnectorStatus;
  latencyMs: number;
  error?: string;
  fetchedAt: string;
}

/** Unavailable sources never contain sample values or claim a successful sync. */
export function errorResponse<T>(
  error: unknown,
  status?: Exclude<ConnectorStatus, "ok">,
  latencyMs = 0,
): ConnectorResponse<T> {
  const message = error instanceof Error ? error.message : String(error);
  const timedOut =
    (error instanceof Error && error.name === "AbortError") || /abort|timeout/i.test(message);
  return {
    data: null,
    mode: "error",
    status: status ?? (timedOut ? "timeout" : "error"),
    latencyMs,
    error: message,
    fetchedAt: new Date().toISOString(),
  };
}

export function hasSourceGeometry(geometry: ProjectGeometry): boolean {
  const centroid = geometry.centroid;
  return !!(
    geometry.hasValidGeometry &&
    centroid &&
    Number.isFinite(centroid.lat) &&
    Number.isFinite(centroid.lng) &&
    centroid.lat >= -90 &&
    centroid.lat <= 90 &&
    centroid.lng >= -180 &&
    centroid.lng <= 180
  );
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 10_000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchConnector<T>(fetcher: () => Promise<T>): Promise<ConnectorResponse<T>> {
  const start = Date.now();
  try {
    const data = await fetcher();
    return {
      data,
      mode: "live",
      status: "ok",
      latencyMs: Date.now() - start,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    return errorResponse<T>(err, undefined, Date.now() - start);
  }
}

export function previewResponse<T>(data: T): ConnectorResponse<T> {
  return {
    data,
    mode: "preview",
    status: "ok",
    latencyMs: 0,
    fetchedAt: new Date().toISOString(),
  };
}

export function missingKeyResponse<T>(): ConnectorResponse<T> {
  return errorResponse<T>("Kildens adgangsnøgle er ikke konfigureret.", "missing_key");
}
