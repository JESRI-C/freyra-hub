import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDatafordelerWatercourse,
  searchDatafordelerWatercourses,
} from "../datafordeler-watercourse.server";
import {
  buildDatafordelerWatercourseGeometryUrl,
  DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES,
  DatafordelerWatercourseError,
  parseDatafordelerWatercourseGeometry,
} from "../datafordeler-watercourse-source";

const ID = "120b35a4-d910-46b9-e063-6f4f210a952b";
const fixture = readFileSync(
  new URL("./fixtures/datafordeler-watercourse.gml", import.meta.url),
  "utf8",
);
const KEY = "fixture-private-key";
const withName = (name: string) =>
  fixture.replace("<sn:navn_1.skrivemaade>Lillemølle Bæk", `<sn:navn_1.skrivemaade>${name}`);
const xmlEntities = (value: string, hexadecimal = false) =>
  Array.from(value, (character) =>
    hexadecimal
      ? `&#x${character.codePointAt(0)!.toString(16).toUpperCase().padStart(6, "0")};`
      : `&#${String(character.codePointAt(0)).padStart(7, "0")};`,
  ).join("");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Datafordeler server transport", () => {
  it("requires a server key before any network call", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", undefined);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(fetchDatafordelerWatercourse(ID, { fetchImpl })).rejects.toThrow("mangler");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("appends lowercase apikey only to the private request and keeps output clean", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture));
    const result = await fetchDatafordelerWatercourse(ID, { fetchImpl });
    const [requestUrl, init] = fetchImpl.mock.calls[0];
    expect(new URL(String(requestUrl)).searchParams.get("apikey")).toBe("fixture-private-key");
    expect(init?.redirect).toBe("manual");
    expect(JSON.stringify(result)).not.toContain("fixture-private-key");
    expect(JSON.stringify(result)).not.toContain("apikey");
  });

  it("uses the five-name query and returns verified suggestions", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture));
    const result = await searchDatafordelerWatercourses("Lillemølle", { fetchImpl });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: ID, name: "Lillemølle Bæk", modifiedAt: null });
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get("FILTER")).toContain(
      "navn_5.skrivemaade",
    );
  });

  describe.each(["geometry", "search"] as const)("%s credential echoes", (operation) => {
    const call = (fetchImpl: typeof fetch) =>
      operation === "geometry"
        ? fetchDatafordelerWatercourse(ID, { fetchImpl })
        : searchDatafordelerWatercourses("Lillemølle", { fetchImpl });

    it.each([
      ["literal primary name", withName(`Before ${KEY} after`)],
      ["decimal entities in primary name", withName(xmlEntities(KEY))],
      ["hexadecimal entities in primary name", withName(xmlEntities(KEY, true))],
      ["mixed text/entities in primary name", withName(`&#102;${KEY.slice(1)}`)],
      ["literal ignored comment", fixture.replace("<wfs:member>", `<!-- ${KEY} --><wfs:member>`)],
      ["escaped ignored source field", fixture.replace("redigeringsklient", xmlEntities(KEY))],
      ["parser-concatenated CDATA name", withName("fixture-<![CDATA[private]]>-key")],
    ])("rejects %s without exposing XML, key or provider URL", async (_, xml) => {
      vi.stubEnv("DATAFORDELER_API_KEY", KEY);
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(xml));
      const error = await call(fetchImpl).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DatafordelerWatercourseError);
      expect(String(error)).toContain("kunne ikke valideres sikkert");
      expect(String(error)).not.toContain(KEY);
      expect(String(error)).not.toContain("FeatureCollection");
      expect(String(error)).not.toContain("wfs.datafordeler.dk");
      expect(error).not.toHaveProperty("cause");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("rejects predefined XML entity escapes for the exact runtime key", async () => {
      const key = `fixture&<>"'private-key`;
      const encoded = "fixture&amp;&lt;&gt;&quot;&apos;private-key";
      const xml = withName(encoded);
      expect(xml).not.toContain(key);
      expect(parseDatafordelerWatercourseGeometry(xml, ID).name).toBe(key);
      vi.stubEnv("DATAFORDELER_API_KEY", key);
      const error = await call(vi.fn<typeof fetch>().mockResolvedValue(new Response(xml))).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(DatafordelerWatercourseError);
      expect(String(error)).toContain("kunne ikke valideres sikkert");
      expect(String(error)).not.toContain(key);
      expect(String(error)).not.toContain(encoded);
      expect(error).not.toHaveProperty("cause");
    });

    it("checks names after the XML parser joins separate text/CDATA pieces", async () => {
      const xml = withName("fixture-<![CDATA[private]]>-key");
      expect(xml).not.toContain(KEY);
      expect(parseDatafordelerWatercourseGeometry(xml, ID).name).toBe(KEY);
      vi.stubEnv("DATAFORDELER_API_KEY", KEY);
      await expect(
        call(vi.fn<typeof fetch>().mockResolvedValue(new Response(xml))),
      ).rejects.toThrow("kunne ikke valideres sikkert");
    });
  });

  it("allows unrelated XML entities while preserving canonical credential-free provenance", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", KEY);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(withName("Fixture &amp; &#66;&#xE6;k")));
    const result = await fetchDatafordelerWatercourse(ID, { fetchImpl });
    expect(result.name).toBe("Fixture & Bæk");
    expect(result.sourceUrl).toBe(buildDatafordelerWatercourseGeometryUrl(ID));
    expect(new URL(result.sourceUrl).searchParams.has("apikey")).toBe(false);
  });

  it.each([302, 401, 403, 500])(
    "cancels HTTP %i without following a redirect or exposing the body",
    async (status) => {
      vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          status,
          headers: { location: "https://evil.test/?apikey=fixture-private-key" },
        }),
      );
      const error = await fetchDatafordelerWatercourse(ID, { fetchImpl }).catch(
        (caught: unknown) => caught,
      );
      expect(String(error)).not.toContain("fixture-private-key");
      expect(String(error)).not.toContain("evil.test");
      expect(cancel).toHaveBeenCalledTimes(1);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("sanitizes even a transport error that contains the private URL", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("https://wfs.datafordeler.dk/?apikey=fixture-private-key"));
    await expect(fetchDatafordelerWatercourse(ID, { fetchImpl })).rejects.toThrow(
      "kunne ikke hentes",
    );
    const error = await fetchDatafordelerWatercourse(ID, { fetchImpl }).catch(
      (caught: unknown) => caught,
    );
    expect(String(error)).not.toContain("fixture-private-key");
    expect(error).not.toHaveProperty("cause");
  });

  it("rejects declared or streamed excess size and cancels the body", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    const declaredCancel = vi.fn();
    const declared = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream({ cancel: declaredCancel }), {
        headers: { "content-length": String(DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES + 1) },
      }),
    );
    await expect(fetchDatafordelerWatercourse(ID, { fetchImpl: declared })).rejects.toThrow(
      "størrelsesgrænsen",
    );
    expect(declaredCancel).toHaveBeenCalledTimes(1);
    const streamedCancel = vi.fn();
    const streamed = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES + 1));
          },
          cancel: streamedCancel,
        }),
      ),
    );
    await expect(fetchDatafordelerWatercourse(ID, { fetchImpl: streamed })).rejects.toThrow(
      "størrelsesgrænsen",
    );
    expect(streamedCancel).toHaveBeenCalledTimes(1);
  });

  it("enforces the same hard deadline during headers and stalled body reads", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    vi.useFakeTimers();
    const fetching = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => undefined));
    const fetchFailure = expect(
      fetchDatafordelerWatercourse(ID, { fetchImpl: fetching, timeoutMs: 20 }),
    ).rejects.toThrow("tidsgrænsen");
    await vi.advanceTimersByTimeAsync(21);
    await fetchFailure;
    const cancel = vi.fn();
    const streaming = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new ReadableStream({ cancel })));
    const bodyFailure = expect(
      fetchDatafordelerWatercourse(ID, { fetchImpl: streaming, timeoutMs: 20 }),
    ).rejects.toThrow("tidsgrænsen");
    await vi.advanceTimersByTimeAsync(21);
    await bodyFailure;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects XML errors without returning raw upstream data", async () => {
    vi.stubEnv("DATAFORDELER_API_KEY", "fixture-private-key");
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<ExceptionReport>fixture-private-key</ExceptionReport>"));
    const error = await fetchDatafordelerWatercourse(ID, { fetchImpl }).catch(
      (caught: unknown) => caught,
    );
    expect(String(error)).not.toContain("fixture-private-key");
  });
});
