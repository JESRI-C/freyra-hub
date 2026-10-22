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
  const normalized = path.replace(/\/+$/, "");
  return (
    /^\/app\/projects\/geometry\/[^/]+$/.test(normalized) ||
    /^\/app\/projects(?:\/[^/]+)?$/.test(normalized) ||
    /^\/app\/reports(?:\/[^/]+)?$/.test(normalized) ||
    /^\/app\/lavbund(?:\/[^/]+(?:\/(?:kort|revisionsspor))?)?$/.test(normalized) ||
    ["/app/settings", "/app/settings/users", "/app/ledger"].includes(normalized)
  );
}
