// Unit tests for upload classification, MIME-guarding and file-name hygiene.
// Covers TESTKRAV: klassifikation af JPEG/HEIC/CSV/Excel/GeoJSON/KML/GPX og
// afvisning af ugyldige filtyper. Rene funktioner — kører i node-miljøet.
import { describe, it, expect } from "vitest";
import {
  detectUploadType,
  isMimeAllowed,
  sanitizeFileName,
  uploadStatusLabel,
  MAX_UPLOAD_BYTES,
  type UploadType,
} from "@/services/monitoring/uploads-service";

describe("detectUploadType — filendelse", () => {
  const cases: Array<[string, UploadType]> = [
    ["billede.jpg", "image"],
    ["billede.jpeg", "image"],
    ["billede.JPG", "image"], // versaler skal normaliseres
    ["billede.png", "image"],
    ["billede.heic", "image"], // HEIC fra iPhone
    ["billede.webp", "image"],
    ["klip.mp4", "video"],
    ["lyd.wav", "audio"],
    ["maalinger.csv", "csv"],
    ["maalinger.xls", "excel"],
    ["maalinger.xlsx", "excel"],
    ["omraade.geojson", "geojson"],
    ["omraade.json", "geojson"],
    ["rute.kml", "kml"],
    ["spor.gpx", "gpx"],
    ["rapport.pdf", "pdf"],
    ["ortho.tif", "orthophoto"],
    ["arkiv.zip", "archive"],
  ];
  it.each(cases)("%s → %s", (name, expected) => {
    expect(detectUploadType(name, "")).toBe(expected);
  });

  it("falder tilbage til MIME når endelsen er ukendt", () => {
    expect(detectUploadType("ukendt.bin", "image/png")).toBe("image");
    expect(detectUploadType("ukendt.bin", "video/mp4")).toBe("video");
    expect(detectUploadType("ukendt.bin", "application/pdf")).toBe("pdf");
    expect(
      detectUploadType(
        "ukendt.bin",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe("excel");
  });

  it("returnerer 'other' når hverken endelse eller MIME kendes", () => {
    expect(detectUploadType("navnlos", "application/octet-stream")).toBe("other");
  });
});

describe("isMimeAllowed", () => {
  it("tillader gyldige upload-MIME-typer", () => {
    for (const mime of [
      "image/jpeg",
      "image/heic",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/json",
      "application/geo+json",
      "application/vnd.google-earth.kml+xml",
      "application/gpx+xml",
    ]) {
      expect(isMimeAllowed(mime)).toBe(true);
    }
  });

  it("afviser ugyldige/ukendte MIME-typer", () => {
    expect(isMimeAllowed("application/x-msdownload")).toBe(false); // .exe
    expect(isMimeAllowed("application/octet-stream")).toBe(false);
    expect(isMimeAllowed("")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("erstatter usikre tegn og bevarer punktum/bindestreg/underscore", () => {
    expect(sanitizeFileName("min fil (1).csv")).toBe("min_fil__1_.csv");
    expect(sanitizeFileName("rå_data-2025.geojson")).toBe("r__data-2025.geojson");
  });

  it("afkorter meget lange navne til 180 tegn", () => {
    const long = "a".repeat(300) + ".csv";
    expect(sanitizeFileName(long).length).toBe(180);
  });

  it("fjerner path-separatorer så traversal ikke er muligt", () => {
    const safe = sanitizeFileName("../../etc/passwd");
    expect(safe).not.toContain("/");
    expect(safe).not.toContain("\\");
    expect(safe).toBe(".._.._etc_passwd"); // punktummer bevares (legitimt for endelser)
  });
});

describe("konstanter og labels", () => {
  it("MAX_UPLOAD_BYTES er 200 MB", () => {
    expect(MAX_UPLOAD_BYTES).toBe(200 * 1024 * 1024);
  });

  it("uploadStatusLabel oversætter kendte statusser og falder tilbage", () => {
    expect(uploadStatusLabel("awaiting_validation")).toBe("Afventer validering");
    expect(uploadStatusLabel("imported")).toBe("Importeret");
    expect(uploadStatusLabel("noget_ukendt")).toBe("noget_ukendt");
  });
});
