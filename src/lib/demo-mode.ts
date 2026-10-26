/** Municipal presentation only. This never enables fabricated/offline demo data. */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const MUNICIPAL_PROJECT_TABS = new Set([
  "arbejde",
  "rapporter",
  "grundlag",
  "audit",
  "roller",
]);

export function isMunicipalRoute(path: string): boolean {
  // The app layout supplies pathname. Keep global prototype sections out of DEMO,
  // including direct links; project tabs have their own municipal allowlist.
  const normalized = path.replace(/\/+$/, "");
  if (/[?#\\\s]/.test(normalized) || /%(?:2f|5c)/i.test(normalized)) return false;
  return (
    /^\/app\/projects\/geometry\/[^/]+$/.test(normalized) ||
    /^\/app\/projects(?:\/[^/]+)?$/.test(normalized) ||
    /^\/app\/lavbund\/[^/]+\/kort$/.test(normalized)
  );
}
