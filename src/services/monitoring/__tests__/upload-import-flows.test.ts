// @vitest-environment happy-dom
// Integrations-nære tests for fil-parserne i upload-import-service. Kører i et
// browser-lignende miljø (happy-dom), fordi parserne bruger FileReader (Papa),
// DOMParser (KML/GPX) og File.arrayBuffer/exifr (billeder).
//
// Dækker TESTKRAV: Upload CSV, Excel, GeoJSON, KML, GPX; Læs GPS fra billede;
// Upload fil med manglende metadata; Map CSV-kolonner; Valider ugyldig dato;
// Valider manglende GPS; samt et samlet "importér"-flow (parse → map → validér).
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  parseCsv,
  parseExcel,
  parseGeoJson,
  parseKml,
  parseGpx,
  parseImage,
  suggestMapping,
  validateTabular,
} from "@/services/monitoring/upload-import-service";

function file(content: BlobPart, name: string, type: string): File {
  return new File([content], name, { type });
}

/** Bygger en minimal, gyldig JPEG med EXIF GPS (55.6761 N, 12.5667 E). */
function jpegWithGps(): File {
  const tiff: number[] = [];
  const p = (...b: number[]) => tiff.push(...b);
  // TIFF-header (little-endian), IFD0 ved offset 8
  p(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00);
  // IFD0: 1 entry → GPSInfo-peger (0x8825), LONG, count 1, offset 26
  p(0x01, 0x00);
  p(0x25, 0x88, 0x04, 0x00, 0x01, 0x00, 0x00, 0x00, 0x1a, 0x00, 0x00, 0x00);
  p(0x00, 0x00, 0x00, 0x00);
  // GPS-IFD ved offset 26: 4 entries
  p(0x04, 0x00);
  p(0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x4e, 0x00, 0x00, 0x00); // LatRef "N"
  p(0x02, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00); // Lat → 80
  p(0x03, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x45, 0x00, 0x00, 0x00); // LngRef "E"
  p(0x04, 0x00, 0x05, 0x00, 0x03, 0x00, 0x00, 0x00, 0x68, 0x00, 0x00, 0x00); // Lng → 104
  p(0x00, 0x00, 0x00, 0x00);
  // Lat @80: 55/1, 40/1, 3396/100
  p(0x37, 0, 0, 0, 1, 0, 0, 0, 0x28, 0, 0, 0, 1, 0, 0, 0, 0x44, 0x0d, 0, 0, 0x64, 0, 0, 0);
  // Lng @104: 12/1, 34/1, 0/1
  p(0x0c, 0, 0, 0, 1, 0, 0, 0, 0x22, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0);
  const tiffArr = Uint8Array.from(tiff);
  const app1len = 2 + 6 + tiffArr.length;
  const head = [
    0xff,
    0xd8,
    0xff,
    0xe1,
    (app1len >> 8) & 0xff,
    app1len & 0xff,
    0x45,
    0x78,
    0x69,
    0x66,
    0x00,
    0x00,
  ];
  const bytes = Uint8Array.from([...head, ...tiffArr, 0xff, 0xd9]);
  return file(bytes, "gps.jpg", "image/jpeg");
}

describe("parseCsv", () => {
  it("læser headers og rækker fra en CSV-fil", async () => {
    const csv =
      "timestamp,lat,lng,value\n2025-01-01T10:00:00Z,55.5,12.5,3.2\n2025-01-02T10:00:00Z,55.6,12.6,4.1\n";
    const preview = await parseCsv(file(csv, "m.csv", "text/csv"));
    expect(preview.kind).toBe("tabular");
    expect(preview.headers).toEqual(["timestamp", "lat", "lng", "value"]);
    expect(preview.totalRows).toBe(2);
    expect(preview.rows[0]).toMatchObject({ lat: "55.5", value: "3.2" });
    expect(preview.sampleRows.length).toBe(2);
  });

  it("springer tomme linjer over", async () => {
    const preview = await parseCsv(file("a,b\n1,2\n\n3,4\n", "e.csv", "text/csv"));
    expect(preview.totalRows).toBe(2);
  });
});

describe("parseExcel", () => {
  function xlsxFile(aoa: unknown[][]): File {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ark1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return file(buf, "m.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  }

  it("læser første ark til rækker med headere", async () => {
    const preview = await parseExcel(
      xlsxFile([
        ["timestamp", "value"],
        ["2025-01-01T00:00:00Z", 12],
        ["2025-01-02T00:00:00Z", 15],
      ]),
    );
    expect(preview.headers).toEqual(["timestamp", "value"]);
    expect(preview.totalRows).toBe(2);
    expect(preview.rows[1]).toMatchObject({ value: 15 });
  });
});

describe("parseGeoJson", () => {
  it("opsummerer punkter, linjer og polygoner samt bbox", async () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [12, 55] } },
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [10, 54],
              [11, 55],
            ],
          },
        },
      ],
    };
    const preview = await parseGeoJson(
      file(JSON.stringify(fc), "x.geojson", "application/geo+json"),
    );
    expect(preview.featureCount).toBe(2);
    expect(preview.points).toBe(1);
    expect(preview.lines).toBe(1);
    expect(preview.bbox).toEqual([10, 54, 12, 55]);
  });
});

describe("parseKml", () => {
  it("konverterer KML-placemarks til geo-preview", async () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <Placemark><name>P1</name><Point><coordinates>12.5,55.5,0</coordinates></Point></Placemark>
          <Placemark><name>Linje</name><LineString><coordinates>12,55,0 13,56,0</coordinates></LineString></Placemark>
        </Document>
      </kml>`;
    const preview = await parseKml(file(kml, "rute.kml", "application/vnd.google-earth.kml+xml"));
    expect(preview.kind).toBe("geo");
    expect(preview.featureCount).toBe(2);
    expect(preview.points).toBe(1);
    expect(preview.lines).toBe(1);
    expect(preview.errors).toHaveLength(0);
  });
});

describe("parseGpx", () => {
  it("konverterer GPX-waypoints/spor til geo-preview", async () => {
    const gpx = `<?xml version="1.0"?>
      <gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
        <wpt lat="55.5" lon="12.5"><name>WP</name></wpt>
        <trk><name>Tur</name><trkseg>
          <trkpt lat="55.50" lon="12.50"></trkpt>
          <trkpt lat="55.51" lon="12.51"></trkpt>
        </trkseg></trk>
      </gpx>`;
    const preview = await parseGpx(file(gpx, "spor.gpx", "application/gpx+xml"));
    expect(preview.kind).toBe("geo");
    expect(preview.featureCount).toBeGreaterThanOrEqual(2);
    expect(preview.points + preview.lines).toBeGreaterThanOrEqual(2);
    expect(preview.errors).toHaveLength(0);
  });
});

describe("parseImage — GPS og metadata", () => {
  it("læser GPS-koordinater fra EXIF", async () => {
    const preview = await parseImage(jpegWithGps());
    expect(preview.kind).toBe("image");
    expect(preview.latitude).toBeCloseTo(55.6761, 3);
    expect(preview.longitude).toBeCloseTo(12.5667, 3);
    expect(preview.errors).toHaveLength(0);
  });

  it("returnerer preview uden koordinater når billedet mangler metadata", async () => {
    // Minimal JPEG uden EXIF (kun SOI + EOI).
    const bare = file(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), "tom.jpg", "image/jpeg");
    const preview = await parseImage(bare);
    expect(preview.kind).toBe("image");
    expect(preview.latitude).toBeUndefined();
    expect(preview.longitude).toBeUndefined();
    expect(preview.capturedAt).toBeUndefined();
    expect(preview.errors).toHaveLength(0);
  });
});

describe("suggestMapping — map CSV-kolonner", () => {
  it("foreslår kanoniske felter ud fra CSV-headers", async () => {
    const csv = "Tidspunkt,Breddegrad,Længdegrad,Værdi,Sensor\n2025-01-01T00:00:00Z,55,12,3,S1\n";
    const preview = await parseCsv(file(csv, "dk.csv", "text/csv"));
    const mapping = suggestMapping(preview.headers);
    expect(mapping.timestamp).toBe("Tidspunkt");
    expect(mapping.latitude).toBe("Breddegrad");
    expect(mapping.longitude).toBe("Længdegrad");
    expect(mapping.value).toBe("Værdi");
    expect(mapping.device).toBe("Sensor");
  });
});

describe("validateTabular — dato og GPS", () => {
  const headers = ["ts", "lat", "lng", "val"];
  const mapping = { timestamp: "ts", latitude: "lat", longitude: "lng", value: "val" };
  const wrap = (rows: Record<string, unknown>[]) => ({
    kind: "tabular" as const,
    headers,
    rows,
    totalRows: rows.length,
    sampleRows: rows.slice(0, 5),
    errors: [],
  });

  it("markerer rækker med ugyldig dato som invalide", () => {
    const s = validateTabular(
      wrap([
        { ts: "2025-01-01T00:00:00Z", lat: 55, lng: 12, val: 1 },
        { ts: "31-02-2025", lat: 55, lng: 12, val: 2 },
        { ts: "ikke-en-dato", lat: 55, lng: 12, val: 3 },
      ]),
      mapping,
    );
    expect(s.validRows).toBe(1);
    expect(s.invalidRows).toBe(2);
    expect(s.errors.some((e) => e.includes("ugyldige"))).toBe(true);
  });

  it("markerer rækker med manglende/ugyldig GPS som invalide", () => {
    const s = validateTabular(
      wrap([
        { ts: "2025-01-01T00:00:00Z", lat: 55, lng: 12, val: 1 },
        { ts: "2025-01-01T00:00:00Z", lat: null, lng: 12, val: 2 }, // manglende lat
        { ts: "2025-01-01T00:00:00Z", lat: 999, lng: 12, val: 3 }, // uden for interval
      ]),
      mapping,
    );
    expect(s.validRows).toBe(1);
    expect(s.invalidRows).toBe(2);
  });

  it("advarer når tids- eller værdikolonne mangler i mappingen", () => {
    const s = validateTabular(wrap([{ lat: 55, lng: 12 }]), { latitude: "lat", longitude: "lng" });
    expect(s.warnings.some((w) => w.includes("tids-kolonne"))).toBe(true);
    expect(s.warnings.some((w) => w.includes("værdi-kolonne"))).toBe(true);
  });
});

describe("samlet importflow: parse → map → validér", () => {
  it("gør en gyldig CSV klar til import uden fejl", async () => {
    const csv =
      "timestamp,latitude,longitude,value\n" +
      "2025-01-01T08:00:00Z,55.5,12.5,3.1\n" +
      "2025-01-02T08:00:00Z,55.6,12.6,3.4\n";
    const preview = await parseCsv(file(csv, "ok.csv", "text/csv"));
    const mapping = suggestMapping(preview.headers);
    const summary = validateTabular(preview, mapping);
    expect(summary.totalRows).toBe(2);
    expect(summary.validRows).toBe(2);
    expect(summary.invalidRows).toBe(0);
    expect(summary.errors).toHaveLength(0);
  });
});
