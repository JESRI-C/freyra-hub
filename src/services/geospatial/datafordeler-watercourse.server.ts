import type { OfficialWatercourseSuggestion } from "./official-watercourse-source";
import {
  buildDatafordelerWatercourseGeometryUrl,
  buildDatafordelerWatercourseSearchUrl,
  DATAFORDELER_WATERCOURSE_ENDPOINT,
  DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES,
  DATAFORDELER_WATERCOURSE_MAX_RESULTS,
  DatafordelerWatercourseError,
  parseDatafordelerWatercourseCollection,
  parseDatafordelerWatercourseGeometry,
  type DatafordelerWatercourseGeometry,
} from "./datafordeler-watercourse-source";

export interface DatafordelerWatercourseFetchOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function fetchXml(
  canonicalUrl: string,
  options: DatafordelerWatercourseFetchOptions,
): Promise<string> {
  const apiKey = process.env.DATAFORDELER_API_KEY?.trim();
  if (!apiKey) {
    throw new DatafordelerWatercourseError(
      "Adgang til Datafordeleren mangler. Den officielle API-nøgle skal tilsluttes på serveren.",
    );
  }
  const url = new URL(canonicalUrl);
  const endpoint = new URL(DATAFORDELER_WATERCOURSE_ENDPOINT);
  if (
    url.origin !== endpoint.origin ||
    url.pathname !== endpoint.pathname ||
    url.username ||
    url.password
  ) {
    throw new DatafordelerWatercourseError("Vandløbets kildeadresse er ugyldig.");
  }
  // Do not return/log this URL: the official service authenticates by query parameter.
  url.searchParams.set("apikey", apiKey);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new DatafordelerWatercourseError("Kildens tidsgrænse er ugyldig.");
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new DatafordelerWatercourseError("Datafordeleren overskred tidsgrænsen."));
    }, timeoutMs);
  });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let completed = false;
  try {
    const fetching = (options.fetchImpl ?? fetch)(url.toString(), {
      headers: { Accept: "application/gml+xml, application/xml, text/xml" },
      redirect: "manual",
      signal: controller.signal,
    });
    void fetching.then(
      (lateResponse) => {
        if (controller.signal.aborted) void lateResponse.body?.cancel().catch(() => undefined);
      },
      () => undefined,
    );
    const response = await Promise.race([fetching, deadline]);
    if (!response.ok || response.redirected) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) {
        throw new DatafordelerWatercourseError(
          "Datafordeleren afviste adgangen. Kontrollér serverens API-nøgle og vent på aktivering, hvis den lige er oprettet.",
        );
      }
      throw new DatafordelerWatercourseError(`Datafordeleren svarede med HTTP ${response.status}.`);
    }
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) ||
        Number(declaredLength) > DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES)
    ) {
      void response.body?.cancel().catch(() => undefined);
      throw new DatafordelerWatercourseError("Datafordelerens svar overskrider størrelsesgrænsen.");
    }
    if (!response.body)
      throw new DatafordelerWatercourseError("Datafordeleren returnerede et tomt svar.");
    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let xml = "";
    let bytes = 0;
    while (true) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (controller.signal.aborted)
        throw new DatafordelerWatercourseError("Datafordeleren overskred tidsgrænsen.");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES)
        throw new DatafordelerWatercourseError(
          "Datafordelerens svar overskrider størrelsesgrænsen.",
        );
      xml += decoder.decode(chunk.value, { stream: true });
    }
    xml += decoder.decode();
    completed = true;
    return xml;
  } catch (error) {
    if (error instanceof DatafordelerWatercourseError) throw error;
    // Upstream/transport errors may contain the signed request URL; never expose their text/cause.
    throw new DatafordelerWatercourseError(
      controller.signal.aborted
        ? "Datafordeleren overskred tidsgrænsen."
        : "Den officielle vandløbskilde kunne ikke hentes fra Datafordeleren.",
    );
  } finally {
    clearTimeout(timeout);
    if (reader && !completed) void reader.cancel().catch(() => undefined);
    reader?.releaseLock();
  }
}

export async function fetchDatafordelerWatercourse(
  id: string,
  options: DatafordelerWatercourseFetchOptions = {},
): Promise<DatafordelerWatercourseGeometry> {
  const url = buildDatafordelerWatercourseGeometryUrl(id);
  const xml = await fetchXml(url, options);
  return parseDatafordelerWatercourseGeometry(xml, id);
}

export async function searchDatafordelerWatercourses(
  query: string,
  options: DatafordelerWatercourseFetchOptions = {},
): Promise<OfficialWatercourseSuggestion[]> {
  const url = buildDatafordelerWatercourseSearchUrl(query);
  const xml = await fetchXml(url, options);
  const { watercourses } = parseDatafordelerWatercourseCollection(xml);
  return watercourses.slice(0, DATAFORDELER_WATERCOURSE_MAX_RESULTS).map((watercourse) => ({
    id: watercourse.id,
    name: watercourse.name,
    nameStatus: watercourse.nameStatus,
    municipalities: watercourse.municipalities,
    center: watercourse.center,
    bbox: watercourse.bbox,
    modifiedAt: watercourse.modifiedAt,
  }));
}
