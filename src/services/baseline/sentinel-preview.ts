export type SentinelThumbnail = {
  href: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

/** Only public thumbnail assets actually returned by CDSE STAC, never constructed image URLs. */
export function isSafeSentinelThumbnailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      ["datahub.creodias.eu", "catalogue.dataspace.copernicus.eu"].includes(url.hostname) &&
      /^\/odata\/v1\/Assets\([0-9a-f-]{36}\)\/\$value$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function selectSentinelPreview<
  T extends {
    id: string;
    datetime: string;
    globalCloudCoverPct: number | null;
    thumbnail?: SentinelThumbnail | null;
  },
>(scenes: T[], referenceDate: string): T | null {
  const reference = Date.parse(`${referenceDate}T12:00:00Z`);
  if (!Number.isFinite(reference)) return null;
  const eligible = scenes.filter(
    (scene) =>
      scene.thumbnail &&
      isSafeSentinelThumbnailUrl(scene.thumbnail.href) &&
      scene.globalCloudCoverPct !== null &&
      scene.globalCloudCoverPct <= 10 &&
      Number.isFinite(Date.parse(scene.datetime)),
  );
  // Prefer scenes catalogued with zero global cloud, then the nearest low-cloud candidate.
  const zeroCloud = eligible.filter((scene) => scene.globalCloudCoverPct === 0);
  return (
    (zeroCloud.length ? zeroCloud : eligible).sort(
      (a, b) =>
        Math.abs(Date.parse(a.datetime) - reference) -
          Math.abs(Date.parse(b.datetime) - reference) ||
        a.globalCloudCoverPct! - b.globalCloudCoverPct! ||
        a.id.localeCompare(b.id),
    )[0] ?? null
  );
}
