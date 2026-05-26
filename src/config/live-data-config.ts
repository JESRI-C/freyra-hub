export interface LiveDataConfig {
  isLiveDataEnabled: boolean;
  mode: "preview" | "live";
  dmiBaseUrl: string;
  credentials: {
    // DMI and Miljøportal are open APIs — no key required
    datafordeler: { present: boolean; key: string | null };
    copernicus: { present: boolean; token: string | null };
  };
  missingKeys: string[];
}

export function getLiveDataConfig(): LiveDataConfig {
  // Prefer server-side process.env when available (server functions),
  // fall back to import.meta.env (client / build-time).
  const serverEnv = (typeof process !== "undefined" ? (process as { env?: Record<string, string | undefined> }).env : undefined) ?? {};
  const clientEnv = import.meta.env as Record<string, string | undefined>;

  const pick = (serverKey: string, clientKey: string): string | null =>
    serverEnv[serverKey] ?? clientEnv[clientKey] ?? null;

  const enableLiveRaw = pick("ENABLE_LIVE_DATA", "VITE_ENABLE_LIVE_DATA");
  const enableLive = enableLiveRaw === "true" || enableLiveRaw === "1";
  const dmiBaseUrl = pick("DMI_BASE_URL", "VITE_DMI_BASE_URL") || "https://opendataapi.dmi.dk";
  const datafordelerKey = pick("DATAFORDELER_KEY", "VITE_DATAFORDELER_KEY");
  const copernicusToken = pick("COPERNICUS_TOKEN", "VITE_COPERNICUS_TOKEN");

  const missingKeys: string[] = [];
  if (!datafordelerKey) missingKeys.push("DATAFORDELER_KEY");
  if (!copernicusToken) missingKeys.push("COPERNICUS_TOKEN");

  const mode: "preview" | "live" = enableLive ? "live" : "preview";

  return {
    isLiveDataEnabled: enableLive,
    mode,
    dmiBaseUrl,
    credentials: {
      datafordeler: { present: !!datafordelerKey, key: datafordelerKey },
      copernicus: { present: !!copernicusToken, token: copernicusToken },
    },
    missingKeys,
  };
}

