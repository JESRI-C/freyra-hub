import { afterEach, describe, expect, it, vi } from "vitest";
import { findPlaces, resolveAddress } from "../place-search.server";

afterEach(() => vi.unstubAllGlobals());
const response = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
describe("current place search", () => {
  it("refines road names and retains resolvable official addresses plus attributed places", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) =>
        url.hostname === "adressevaelger.dk"
          ? response({
              status: "ok",
              fund: [
                { type: "vejnavn", titel: "Bøgevej" },
                {
                  type: "husnummer",
                  titel: "Stadion Allé 26",
                  id: "0a3f5096-f298-32b8-e044-0003ba298018",
                },
              ],
            })
          : response({
              features: [
                {
                  geometry: { type: "Point", coordinates: [10.575, 56.226] },
                  properties: { name: "Molslaboratoriet", countrycode: "DK" },
                },
              ],
            }),
      ),
    );
    const results = await findPlaces("Bøg");
    expect(results[0]).toMatchObject({ refine: true, tekst: "Bøgevej" });
    expect(results[1].href).toBe(
      "https://adressevaelger.dk/husnumre/0a3f5096-f298-32b8-e044-0003ba298018",
    );
    expect(results[2]).toMatchObject({
      lat: 56.226,
      lng: 10.575,
      attribution: expect.stringContaining("OpenStreetMap"),
    });
  });
  it("converts verified official UTM coordinates, never interpreting them as degrees", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          status: "ok",
          husnummer: {
            adgangspunkt: {
              geometri: {
                type: "Point",
                crs: { properties: { name: "EPSG:25832" } },
                coordinates: [574193.06, 6222548],
              },
            },
          },
        }),
      ),
    );
    const location = await resolveAddress(
      "https://adressevaelger.dk/husnumre/0a3f5096-f298-32b8-e044-0003ba298018",
    );
    expect(location.lat).toBeCloseTo(56.141, 2);
    expect(location.lng).toBeCloseTo(10.194, 2);
  });
  it("refuses arbitrary resolver URLs before fetching", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const url of [
      "http://127.0.0.1/admin",
      "https://adressevaelger.dk.evil.test/husnumre/a",
      "https://adressevaelger.dk/husnumre/0a3f5096-f298-32b8-e044-0003ba298018?redirect=1",
    ])
      await expect(resolveAddress(url)).rejects.toThrow("Ugyldigt");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not turn service failure into an empty search result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 410 })),
    );
    await expect(findPlaces("Bøgevej")).rejects.toThrow("utilgængelig");
  });
});
