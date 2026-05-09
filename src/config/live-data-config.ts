export interface LiveDataConfig {
  isLiveDataEnabled: boolean;
  mode: "preview" | "live";
  credentials: {
    dmi: { present: boolean; key: string | null };
    datafordeler: { present: boolean; key: string | null };
    copernicus: { present: boolean; token: string | null };
  };
  missingKeys: string[];
}

export function getLiveDataConfig(): LiveDataConfig {
  const enableLive = import.meta.env.VITE_ENABLE_LIVE_DATA === "true";
  const dmiKey = import.meta.env.VITE_DMI_API_KEY || null;
  const datafordelerKey = import.meta.env.VITE_DATAFORDELER_KEY || null;
  const copernicusToken = import.meta.env.VITE_COPERNICUS_TOKEN || null;

  const missingKeys: string[] = [];
  if (!dmiKey) missingKeys.push("VITE_DMI_API_KEY");
  if (!datafordelerKey) missingKeys.push("VITE_DATAFORDELER_KEY");
  if (!copernicusToken) missingKeys.push("VITE_COPERNICUS_TOKEN");

  const hasAnyLiveKey = !!dmiKey || !!datafordelerKey || !!copernicusToken;
  const mode: "preview" | "live" = enableLive && hasAnyLiveKey ? "live" : "preview";

  return {
    isLiveDataEnabled: enableLive,
    mode,
    credentials: {
      dmi: { present: !!dmiKey, key: dmiKey },
      datafordeler: { present: !!datafordelerKey, key: datafordelerKey },
      copernicus: { present: !!copernicusToken, token: copernicusToken },
    },
    missingKeys,
  };
}
