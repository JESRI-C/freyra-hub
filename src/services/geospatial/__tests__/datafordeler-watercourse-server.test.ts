import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchDatafordelerWatercourse,
  searchDatafordelerWatercourses,
} from "../datafordeler-watercourse.server";
import { DATAFORDELER_WATERCOURSE_MAX_RESPONSE_BYTES } from "../datafordeler-watercourse-source";

const ID = "120b35a4-d910-46b9-e063-6f4f210a952b";
const fixture = readFileSync(
  new URL("./fixtures/datafordeler-watercourse.gml", import.meta.url),
  "utf8",
);
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
