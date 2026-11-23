import { describe, expect, it } from "vitest";
import { normalizeMetadata, runBatch, sha256, type FileProgress } from "../drone-ingest";
import {
  startProcessing,
  pollProcessing,
  type ProcessingJob,
  type PhotogrammetryAdapter,
} from "../drone-processing";

describe("drone originals", () => {
  it("does not invent GPS from missing or invalid metadata", () => {
    expect(normalizeMetadata(null).latitude).toBeNull();
    expect(normalizeMetadata({ latitude: 91, longitude: 12 }).longitude).toBeNull();
    expect(normalizeMetadata({ latitude: 0, longitude: 0 }).latitude).toBe(0);
  });
  it("preserves own GPS and normalizes camera bearing", () => {
    const meta = normalizeMetadata({
      latitude: 55,
      longitude: 9,
      GimbalYawDegree: -90,
      DateTimeOriginal: new Date("2026-10-26T12:00:00Z"),
    });
    expect(meta.longitude).toBe(9);
    expect(meta.direction).toBe(270);
    expect(meta.capturedAt).toBe("2026-10-26T12:00:00.000Z");
  });
  it("checksums bytes rather than filenames", async () => {
    expect(await sha256(new Blob(["abc"]))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("processes every file, isolates errors, and retries only failures", async () => {
    const files = ["a.jpg", "b.jpg", "c.jpg"].map((name) => new File([name], name));
    let progress: FileProgress[] = [];
    const seen: string[] = [];
    await runBatch(
      files,
      async (f) => {
        seen.push(f.name);
        if (f.name === "b.jpg") throw new Error("offline");
        return { item: f.name, duplicate: f.name === "c.jpg", missingGps: true };
      },
      (p) => {
        progress = p;
      },
    );
    expect(seen).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(progress.map((p) => p.status)).toEqual(["uploaded", "failed", "duplicate"]);
    const retry: string[] = [];
    await runBatch(
      files,
      async (f) => {
        retry.push(f.name);
        return { item: f.name, duplicate: false, missingGps: false };
      },
      (p) => {
        progress = p;
      },
      progress,
    );
    expect(retry).toEqual(["b.jpg"]);
    expect(progress.every((p) => p.status !== "failed")).toBe(true);
  });
});
const job: ProcessingJob = {
  id: "j",
  projectId: "p",
  flightId: "f",
  inputVersion: "version-a",
  status: "blocked",
  progress: 0,
  error: null,
  outputs: [],
};
describe("photogrammetry boundary", () => {
  it("reports unavailable provider without fake success", async () => {
    const result = await startProcessing(job);
    expect(result.status).toBe("blocked");
    expect(result.outputs).toEqual([]);
    expect(result.error).toContain("Ingen autoriseret");
  });
  it("rejects completed output for another input version", async () => {
    const provider: PhotogrammetryAdapter = {
      submit: async () => ({ providerJobId: "remote" }),
      poll: async () => ({
        status: "completed",
        progress: 100,
        outputs: [
          {
            path: "out.tif",
            sha256: "a".repeat(64),
            inputVersion: "other",
            crs: "EPSG:25832",
            kind: "orthophoto",
          },
        ],
      }),
    };
    expect((await pollProcessing(job, "remote", provider)).status).toBe("failed");
  });
  it("does not re-submit a running job", async () => {
    const provider: PhotogrammetryAdapter = {
      submit: async () => {
        throw new Error("must not submit");
      },
      poll: async () => ({ status: "running", progress: 20 }),
    };
    expect((await startProcessing({ ...job, status: "running" }, provider)).status).toBe("running");
  });
});

import { validateOrthophotoReference } from "../orthophoto-metadata";
describe("orthophoto georeference", () => {
  it("blocks ordinary TIFF without transform or known CRS", () => {
    expect(
      validateOrthophotoReference({
        crs: null,
        bbox: [0, 0, 100, 100],
        width: 100,
        height: 100,
        hasTransform: false,
      }).status,
    ).toBe("blocked");
  });
  it("records CRS and bounds but does not equate georeferencing with approved accuracy", () => {
    const result = validateOrthophotoReference({
      crs: 25832,
      bbox: [500000, 6000000, 500100, 6000100],
      width: 100,
      height: 100,
      hasTransform: true,
    });
    expect(result.crs).toBe("EPSG:25832");
    expect(result.status).toBe("georeferenced");
    expect(result.measurementApproved).toBe(false);
  });
});
it("retains remote identity and does not submit an already queued job twice", async () => {
  let submitted = 0;
  const provider: PhotogrammetryAdapter = {
    submit: async () => {
      submitted++;
      return { providerJobId: "remote" };
    },
    poll: async () => ({ status: "queued", progress: 0 }),
  };
  const queued = await startProcessing(job, provider);
  const again = await startProcessing(queued, provider);
  expect(submitted).toBe(1);
  expect(again.providerJobId).toBe("remote");
});
