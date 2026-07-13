// Integrationstest for uploadFile med en mocket Supabase-klient. Verificerer
// størrelses- og MIME-guards, det fulde upload→insert→audit-flow samt rollback
// af storage-objektet hvis databaseindsættelsen fejler.
//
// Dækker TESTKRAV: Upload for stor fil, Upload ugyldig fil, og import af en
// gyldig fil til uploads-tabellen.
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    failInsert: false,
    uploaded: [] as string[],
    inserted: [] as Record<string, unknown>[],
    removed: [] as string[],
  };
  const storageApi = {
    upload: vi.fn(async (path: string) => {
      state.uploaded.push(path);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      state.removed.push(...paths);
      return { error: null };
    }),
    createSignedUrl: vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/object" },
      error: null,
    })),
  };
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-123" } } })) },
    storage: { from: vi.fn(() => storageApi) },
    from: vi.fn(() => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (state.failInsert) return { data: null, error: { message: "insert failed" } };
            const saved = { ...row, id: "upload-1", created_at: "2026-01-01T00:00:00Z" };
            state.inserted.push(saved);
            return { data: saved, error: null };
          },
        }),
      }),
    })),
  };
  return { state, storageApi, client };
});

vi.mock("@/lib/supabase/client", () => ({
  supabase: h.client,
  isSupabaseConfigured: true,
  getSupabaseClient: () => h.client,
}));

vi.mock("@/services/monitoring/audit-service", () => ({
  logAuditEvent: vi.fn(async () => undefined),
}));

import {
  uploadFile,
  createSignedUrl,
  MAX_UPLOAD_BYTES,
} from "@/services/monitoring/uploads-service";
import { logAuditEvent } from "@/services/monitoring/audit-service";

function csvFile(name = "m.csv"): File {
  return new File(["a,b\n1,2\n"], name, { type: "text/csv" });
}

beforeEach(() => {
  h.state.failInsert = false;
  h.state.uploaded.length = 0;
  h.state.inserted.length = 0;
  h.state.removed.length = 0;
  vi.clearAllMocks();
});

describe("uploadFile — guards", () => {
  it("afviser filer over 200 MB uden at røre storage", async () => {
    const big = csvFile("stor.csv");
    Object.defineProperty(big, "size", { value: MAX_UPLOAD_BYTES + 1 });
    await expect(uploadFile({ file: big, projectId: "p1" })).rejects.toThrow(/for stor/i);
    expect(h.state.uploaded).toHaveLength(0);
    expect(h.state.inserted).toHaveLength(0);
  });

  it("afviser ugyldige/uunderstøttede filtyper", async () => {
    const exe = new File(["MZ"], "virus.exe", { type: "application/x-msdownload" });
    await expect(uploadFile({ file: exe, projectId: "p1" })).rejects.toThrow(/understøttes ikke/i);
    expect(h.state.uploaded).toHaveLength(0);
  });
});

describe("uploadFile — happy path", () => {
  it("uploader til storage, indsætter række og logger audit-event", async () => {
    const row = await uploadFile({ file: csvFile(), projectId: "proj-1" });

    expect(h.state.uploaded).toHaveLength(1);
    expect(h.state.uploaded[0]).toMatch(/^user-123\/\d+-m\.csv$/); // per-bruger-mappe
    expect(h.state.inserted).toHaveLength(1);
    expect(h.state.inserted[0]).toMatchObject({
      project_id: "proj-1",
      uploaded_by: "user-123",
      upload_type: "csv",
      mime_type: "text/csv",
      status: "awaiting_validation",
    });
    expect(row.id).toBe("upload-1");
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "upload_created", entityType: "upload" }),
    );
  });
});

describe("uploadFile — rollback", () => {
  it("fjerner storage-objektet igen hvis databaseindsættelsen fejler", async () => {
    h.state.failInsert = true;
    await expect(uploadFile({ file: csvFile(), projectId: "p1" })).rejects.toBeTruthy();
    expect(h.state.uploaded).toHaveLength(1);
    expect(h.state.removed).toEqual(h.state.uploaded); // samme path ryddet op
    expect(logAuditEvent).not.toHaveBeenCalled();
  });
});

describe("createSignedUrl", () => {
  it("returnerer en signeret URL fra storage", async () => {
    const url = await createSignedUrl("user-123/obj.csv", 120);
    expect(url).toBe("https://signed.example/object");
    expect(h.storageApi.createSignedUrl).toHaveBeenCalledWith("user-123/obj.csv", 120);
  });
});
