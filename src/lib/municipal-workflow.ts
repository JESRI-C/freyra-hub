/** The municipal workflow is the product workflow, independent of environment flags. */
export const MUNICIPAL_WORKFLOW = true;
/** Text assistance and automatic image review have separate release gates. */
export const AUTOMATIC_PHOTO_REVIEW_ENABLED = false;

/** Optional planting remains directly addressable but is not a delivery prerequisite. */
export const MUNICIPAL_CORE_STEP_IDS = [
  "billeder",
  "datagrundlag",
  "gennemgang",
  "baseline",
  "udfoerelse",
  "sammenligning",
  "rapport",
] as const;
export function adjacentMunicipalStep(step: string, direction: -1 | 1) {
  if (step === "beplantning") return direction === 1 ? "rapport" : "sammenligning";
  const index = MUNICIPAL_CORE_STEP_IDS.findIndex((id) => id === step);
  return index < 0 ? undefined : MUNICIPAL_CORE_STEP_IDS[index + direction];
}

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
