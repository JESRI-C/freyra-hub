import { z } from "zod";
import { readPublicBytes } from "./baseline/bounded-public-read.server";
import { nativeNaturePointForDisplay } from "./nature-geo-transform";

export interface PlaceSuggestion {
  tekst: string;
  type: string;
  href?: string;
  lat?: number;
  lng?: number;
  refine?: boolean;
  attribution?: string;
}

const ADDRESS = "https://adressevaelger.dk";
// Public transition token recommended by KDS until user management is introduced.
// https://confluence.kds.dk/display/ADV/Brugerstyring
const token = () => process.env.ADRESSEVAELGER_TOKEN?.trim() || "adressevaelger123";
const point = z.tuple([z.number().min(7).max(16), z.number().min(54).max(58)]);
const addressSearch = z.object({
  status: z.literal("ok"),
  fund: z.array(z.object({ type: z.string(), titel: z.string(), id: z.string().optional() })),
});

async function json(url: URL, timeout = 4500): Promise<unknown> {
  try {
    const bytes = await readPublicBytes(url, {
      maxBytes: 256 * 1024,
      timeoutMs: timeout,
      mediaType: "application/json",
    });
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // Never leak credential-bearing provider URLs or response bodies.
    throw new Error("Stedsøgningen kunne ikke hente data. Prøv igen eller brug koordinater.");
  }
}

async function addresses(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL("/husnumre/soeg", ADDRESS);
  url.search = new URLSearchParams({ tekst: query, maksimum: "6", token: token() }).toString();
  const data = addressSearch.parse(await json(url));
  return data.fund.map((item) => ({
    tekst: item.titel,
    type: item.type === "husnummer" ? "Adresse" : "Vej",
    href: item.type === "husnummer" && item.id ? `${ADDRESS}/husnumre/${item.id}` : undefined,
    refine: item.type !== "husnummer",
    attribution: "Klimadatastyrelsen · Adressevælger",
  }));
}

async function places(query: string): Promise<PlaceSuggestion[]> {
  // Location aid only. OSM results are never legal boundaries or baseline evidence.
  const url = new URL("https://photon.komoot.io/api/");
  url.search = new URLSearchParams({ q: query, limit: "6", bbox: "7,54,16,58" }).toString();
  const data = z
    .object({
      features: z.array(
        z.object({
          geometry: z.object({ type: z.literal("Point"), coordinates: z.array(z.number()) }),
          properties: z.object({
            name: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            countrycode: z.string().optional(),
          }),
        }),
      ),
    })
    .parse(await json(url));
  return data.features.flatMap((feature) => {
    const coordinates = point.safeParse(feature.geometry.coordinates);
    if (
      !coordinates.success ||
      feature.properties.countrycode?.toUpperCase() !== "DK" ||
      !feature.properties.name
    )
      return [];
    const p = feature.properties;
    return [
      {
        tekst: [p.name, p.city || p.state].filter(Boolean).join(", "),
        type: "Sted",
        lng: coordinates.data[0],
        lat: coordinates.data[1],
        attribution: "© OpenStreetMap · Photon (stedreference)",
      },
    ];
  });
}

export async function findPlaces(query: string): Promise<PlaceSuggestion[]> {
  const results = await Promise.allSettled([addresses(query), places(query)]);
  if (results.every((result) => result.status === "rejected"))
    throw new Error("Stedsøgningen er utilgængelig. Prøv igen eller indtast koordinater.");
  const items = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.tekst}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function resolveAddress(href: string): Promise<{ lat: number; lng: number }> {
  const url = new URL(href);
  if (
    url.origin !== ADDRESS ||
    !/^\/husnumre\/[a-f0-9-]{36}$/i.test(url.pathname) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Ugyldigt adresseopslag.");
  url.searchParams.set("token", token());
  const detail = z
    .object({
      status: z.literal("ok"),
      husnummer: z.object({
        adgangspunkt: z.object({
          geometri: z.object({
            type: z.literal("Point"),
            crs: z.object({ properties: z.object({ name: z.literal("EPSG:25832") }) }),
            coordinates: z.tuple([z.number(), z.number()]),
          }),
        }),
      }),
    })
    .parse(await json(url));
  const [lng, lat] = nativeNaturePointForDisplay(
    detail.husnummer.adgangspunkt.geometri.coordinates,
  );
  return { lat, lng };
}
