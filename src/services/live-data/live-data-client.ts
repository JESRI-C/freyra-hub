export type ConnectorMode = "live" | "preview" | "error";

export interface ConnectorResponse<T> {
  data: T | null;
  mode: ConnectorMode;
  status: "ok" | "error" | "missing_key" | "timeout";
  latencyMs: number;
  error?: string;
  fetchedAt: string;
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
    const msg = err instanceof Error ? err.message : String(err);
    return {
      data: null,
      mode: "error",
      status: msg.includes("abort") ? "timeout" : "error",
      latencyMs: Date.now() - start,
      error: msg,
      fetchedAt: new Date().toISOString(),
    };
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
  return {
    data: null,
    mode: "preview",
    status: "missing_key",
    latencyMs: 0,
    fetchedAt: new Date().toISOString(),
  };
}
