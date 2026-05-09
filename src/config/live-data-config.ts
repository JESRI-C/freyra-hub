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
  const enableLive = import.meta.env.VITE_ENABLE_LIVE_DATA === "true";
  const dmiBaseUrl = import.meta.env.VITE_DMI_BASE_URL || "https://opendataapi.dmi.dk";
  const datafordelerKey = import.meta.env.VITE_DATAFORDELER_KEY || null;
  const copernicusToken = import.meta.env.VITE_COPERNICUS_TOKEN || null;

  // Only key-gated connectors count as "missing"
  const missingKeys: string[] = [];
  if (!datafordelerKey) missingKeys.push("VITE_DATAFORDELER_KEY");
  if (!copernicusToken) missingKeys.push("VITE_COPERNICUS_TOKEN");

  // DMI + Miljøportal are always available — live mode only requires the flag
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
