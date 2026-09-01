import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbFrom: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  fetchEvidenceFilesByProject: vi.fn(),
  fetchAllEvidenceFiles: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: mocks.dbFrom,
    storage: { from: mocks.storageFrom },
  },
}));

vi.mock("@/lib/supabase/queries", () => ({
  fetchEvidenceFilesByProject: mocks.fetchEvidenceFilesByProject,
  fetchAllEvidenceFiles: mocks.fetchAllEvidenceFiles,
}));

import {
  deleteProjectMedia,
  listProjectMedia,
  type MediaServiceResult,
  uploadProjectMedia,
} from "@/services/project-media-service";
import { sanitizeEvidenceFileName, uploadEvidenceFile } from "@/services/evidence-service";

const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
const MEDIA_ID = "b0000000-0000-4000-8000-000000000002";
const MEDIA_PATH = `${PROJECT_ID}/1777777777000_feltfoto.jpg`;

type DbResult = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  error: { message: string } | null;
};

function createQueryBuilder(options: { listResult?: DbResult; singleResults?: DbResult[] }) {
  const singleResults = [...(options.singleResults ?? [])];
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
  };

  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.order.mockResolvedValue(options.listResult ?? { data: [], error: null });
  builder.single.mockImplementation(async () => {
    const result = singleResults.shift();
    if (!result) throw new Error("Testen mangler et single()-resultat");
    return result;
  });

  return builder;
}

function mediaRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MEDIA_ID,
    project_id: PROJECT_ID,
    title: "Feltfoto",
    description: null,
    category: "field_photo",
    source: "field_upload",
    file_path: MEDIA_PATH,
    url: "https://legacy-public.example/project-media/feltfoto.jpg",
    thumbnail_url: "https://legacy-public.example/project-media/thumb.jpg",
    uploaded_at: "2026-08-31T10:00:00.000Z",
    captured_at: null,
    lat: null,
    lng: null,
    altitude_m: null,
    accuracy_m: null,
    is_report_ready: false,
    tags: [],
    status: "uploaded",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    remove: mocks.remove,
    createSignedUrl: mocks.createSignedUrl,
  });
  mocks.upload.mockResolvedValue({ data: { path: MEDIA_PATH }, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example/signed/feltfoto.jpg?token=short-lived" },
    error: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("private project media", () => {
  it("materialiserer kun en kortvarig signed URL og ignorerer persisterede public URLs", async () => {
    const builder = createQueryBuilder({
      listResult: { data: [mediaRow()], error: null },
    });
    mocks.dbFrom.mockReturnValue(builder);

    const result = await listProjectMedia(PROJECT_ID);

    expect(mocks.storageFrom).toHaveBeenCalledWith("project-media");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(MEDIA_PATH, 300);
    expect(result).toEqual({
      data: [
        expect.objectContaining({
          id: MEDIA_ID,
          projectId: PROJECT_ID,
          url: "https://storage.example/signed/feltfoto.jpg?token=short-lived",
        }),
      ],
      error: null,
    });
    expect(result.data?.[0]?.thumbnailUrl).toBeUndefined();
    expect(result.data?.[0]?.url).not.toContain("legacy-public.example");
  });

  it("fejler lukket, hvis en privat URL ikke kan signeres", async () => {
    const builder = createQueryBuilder({
      listResult: { data: [mediaRow()], error: null },
    });
    mocks.dbFrom.mockReturnValue(builder);
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "RLS afviste signering" },
    });

    await expect(listProjectMedia(PROJECT_ID)).resolves.toEqual({
      data: null,
      error: "RLS afviste signering",
    });
  });

  it("persisterer aldrig den signerede URL ved upload", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
    const builder = createQueryBuilder({
      singleResults: [{ data: mediaRow(), error: null }],
    });
    mocks.dbFrom.mockReturnValue(builder);
    const file = {
      name: "feltfoto.jpg",
      size: 12,
      type: "image/jpeg",
    } as File;

    const result = await uploadProjectMedia({
      projectId: PROJECT_ID,
      file,
      title: "Feltfoto",
      category: "field_photo",
      source: "field_upload",
      isReportReady: false,
      tags: [],
    });

    expect(mocks.upload).toHaveBeenCalledWith(MEDIA_PATH, file, {
      cacheControl: "300",
      upsert: false,
      contentType: "image/jpeg",
    });
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        file_path: MEDIA_PATH,
        url: "",
        thumbnail_url: null,
      }),
    );
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(MEDIA_PATH, 300);
    expect(result.data?.url).toContain("token=short-lived");
  });

  it("ignorerer en manipuleret caller-path og sletter kun stien fra den autoriserede DB-række", async () => {
    const builder = createQueryBuilder({
      singleResults: [
        { data: mediaRow(), error: null },
        { data: { id: MEDIA_ID }, error: null },
      ],
    });
    mocks.dbFrom.mockReturnValue(builder);

    const legacyCall = deleteProjectMedia as unknown as (
      id: string,
      callerPath: string,
    ) => Promise<MediaServiceResult<void>>;
    const result = await legacyCall(MEDIA_ID, "c0000000-0000-4000-8000-000000000003/stjålet.jpg");

    expect(builder.select).toHaveBeenNthCalledWith(1, "project_id,file_path");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", MEDIA_ID);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledWith([MEDIA_PATH]);
    expect(mocks.remove).not.toHaveBeenCalledWith([
      "c0000000-0000-4000-8000-000000000003/stjålet.jpg",
    ]);
    expect(builder.delete).toHaveBeenCalledOnce();
    expect(result).toEqual({ data: undefined, error: null });
  });
});

describe("private evidence uploads", () => {
  it("sanitiserer filnavnet, gemmer kun Storage-stien og rydder objektet ved DB-fejl", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_777_777_777_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const builder = createQueryBuilder({
      singleResults: [{ data: null, error: { message: "RLS afviste insert" } }],
    });
    mocks.dbFrom.mockReturnValue(builder);
    const file = {
      name: "../../felt rapport?.pdf",
      size: 12,
      type: "application/pdf",
    } as File;

    const result = await uploadEvidenceFile({
      projectId: PROJECT_ID,
      title: "Feltrapport",
      evidenceType: "feltrapport",
      file,
    });

    const uploadedPath = mocks.upload.mock.calls[0]?.[0] as string;
    expect(uploadedPath).toBe(`${PROJECT_ID}/1777777777000_felt_rapport_.pdf`);
    expect(builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        file_url: uploadedPath,
      }),
    );
    expect(mocks.remove).toHaveBeenCalledWith([uploadedPath]);
    expect(result).toBeNull();
  });

  it("normaliserer path-separatorer, dotfiles og tomme filnavne fail-closed", () => {
    expect(sanitizeEvidenceFileName("folder\\rapport 2026?.pdf")).toBe("rapport_2026_.pdf");
    expect(sanitizeEvidenceFileName("../.env")).toBe("env");
    expect(sanitizeEvidenceFileName("...")).toBe("evidence-file");
  });
});
