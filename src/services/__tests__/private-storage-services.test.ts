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
import {
  getEvidenceDownloadUrl,
  isEvidenceDownloadAvailable,
  sanitizeEvidenceFileName,
  uploadEvidenceFile,
} from "@/services/evidence-service";

const PROJECT_ID = "a0000000-0000-4000-8000-000000000001";
const MEDIA_ID = "b0000000-0000-4000-8000-000000000002";
const EVIDENCE_ID = "d0000000-0000-4000-8000-000000000004";
const OTHER_PROJECT_ID = "c0000000-0000-4000-8000-000000000003";
const ORGANIZATION_ID = "e0000000-0000-4000-8000-000000000005";
const MEDIA_PATH = `${PROJECT_ID}/1777777777000_feltfoto.jpg`;
const EVIDENCE_PATH = `${PROJECT_ID}/1777777777000_feltrapport.pdf`;
const UNSAFE_EVIDENCE_PATH_CASES: Array<[string, string]> = [
  ["offentlig URL", "https://public.example/feltrapport.pdf"],
  ["absolut sti", `/evidence-files/${EVIDENCE_PATH}`],
  ["fremmed projekt", `${OTHER_PROJECT_ID}/feltrapport.pdf`],
  ["traversal", `${PROJECT_ID}/../hemmelig.pdf`],
  ["procentkodet traversal", `${PROJECT_ID}/%2e%2e/hemmelig.pdf`],
  ["procentkodet skråstreg", `${PROJECT_ID}/rapporter%2Fhemmelig.pdf`],
  ["procentkodet backslash", `${PROJECT_ID}/rapporter%5Chemmelig.pdf`],
  ["backslash", `${PROJECT_ID}\\hemmelig.pdf`],
  ["indledende whitespace", ` ${PROJECT_ID}/feltrapport.pdf`],
  ["afsluttende whitespace", `${PROJECT_ID}/feltrapport.pdf `],
  ["whitespace i segment", `${PROJECT_ID}/felt rapport.pdf`],
  ["querytegn", `${PROJECT_ID}/feltrapport.pdf?download=1`],
  ["fragment", `${PROJECT_ID}/feltrapport.pdf#version`],
  ["kontroltegn", `${PROJECT_ID}/felt\u0000rapport.pdf`],
  ["carriage return", `${PROJECT_ID}/felt\rrapport.pdf`],
  ["linjeskift", `${PROJECT_ID}/felt\nrapport.pdf`],
  ["tomt segment", `${PROJECT_ID}//feltrapport.pdf`],
  [
    "forkert canonical projekt",
    `organizations/${PROJECT_ID}/projects/${OTHER_PROJECT_ID}/evidence/fil.pdf`,
  ],
  ["for kort canonical sti", `organizations/${ORGANIZATION_ID}/projects/${PROJECT_ID}/fil.pdf`],
];

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

describe("private evidence downloads", () => {
  it("slår rækken op med id og projekt før et fast 300-sekunders link signeres", async () => {
    const builder = createQueryBuilder({
      singleResults: [
        {
          data: { id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: EVIDENCE_PATH },
          error: null,
        },
      ],
    });
    mocks.dbFrom.mockReturnValue(builder);
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed/feltrapport.pdf?token=short-lived" },
      error: null,
    });

    const result = await getEvidenceDownloadUrl({
      evidenceId: EVIDENCE_ID,
      projectId: PROJECT_ID,
    });

    expect(mocks.dbFrom).toHaveBeenCalledWith("evidence_files");
    expect(builder.select).toHaveBeenCalledWith("id,project_id,file_url");
    expect(builder.eq).toHaveBeenNthCalledWith(1, "id", EVIDENCE_ID);
    expect(builder.eq).toHaveBeenNthCalledWith(2, "project_id", PROJECT_ID);
    expect(mocks.storageFrom).toHaveBeenCalledWith("evidence-files");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(EVIDENCE_PATH, 300, { download: true });
    expect(result).toEqual({
      data: "https://storage.example/signed/feltrapport.pdf?token=short-lived",
      error: null,
    });
  });

  it("stopper før Storage, når RLS-opslaget ikke giver præcis den anmodede række", async () => {
    const deniedBuilder = createQueryBuilder({
      singleResults: [{ data: null, error: { message: "0 rows" } }],
    });
    mocks.dbFrom.mockReturnValueOnce(deniedBuilder);

    await expect(
      getEvidenceDownloadUrl({ evidenceId: EVIDENCE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({
      data: null,
      error: "Dokumentationen blev ikke fundet, eller du har ikke adgang til den.",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    const mismatchBuilder = createQueryBuilder({
      singleResults: [
        {
          data: { id: EVIDENCE_ID, project_id: OTHER_PROJECT_ID, file_url: EVIDENCE_PATH },
          error: null,
        },
      ],
    });
    mocks.dbFrom.mockReturnValue(mismatchBuilder);

    const mismatch = await getEvidenceDownloadUrl({
      evidenceId: EVIDENCE_ID,
      projectId: PROJECT_ID,
    });
    expect(mismatch.data).toBeNull();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it.each(UNSAFE_EVIDENCE_PATH_CASES)("afviser %s før Storage", async (_case, fileUrl) => {
    const builder = createQueryBuilder({
      singleResults: [
        {
          data: { id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: fileUrl },
          error: null,
        },
      ],
    });
    mocks.dbFrom.mockReturnValue(builder);

    const result = await getEvidenceDownloadUrl({
      evidenceId: EVIDENCE_ID,
      projectId: PROJECT_ID,
    });

    expect(result.data).toBeNull();
    expect(result.error).toContain("Storage-sti");
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it("accepterer den dokumenterede canonical organisations-/projektsti", async () => {
    const canonicalPath = `organizations/${ORGANIZATION_ID}/projects/${PROJECT_ID}/evidence/${EVIDENCE_ID}/feltrapport.pdf`;
    const builder = createQueryBuilder({
      singleResults: [
        {
          data: { id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: canonicalPath },
          error: null,
        },
      ],
    });
    mocks.dbFrom.mockReturnValue(builder);

    const result = await getEvidenceDownloadUrl({
      evidenceId: EVIDENCE_ID,
      projectId: PROJECT_ID,
    });

    expect(mocks.createSignedUrl).toHaveBeenCalledWith(canonicalPath, 300, { download: true });
    expect(result.error).toBeNull();
  });

  it("fejler lukket ved Storage-fejl eller tom signer-URL", async () => {
    const row = { id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: EVIDENCE_PATH };
    const errorBuilder = createQueryBuilder({
      singleResults: [{ data: row, error: null }],
    });
    mocks.dbFrom.mockReturnValueOnce(errorBuilder);
    mocks.createSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { message: "intern Storage-detalje" },
    });

    await expect(
      getEvidenceDownloadUrl({ evidenceId: EVIDENCE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({ data: null, error: "Kunne ikke oprette et sikkert downloadlink." });

    const emptyBuilder = createQueryBuilder({
      singleResults: [{ data: row, error: null }],
    });
    mocks.dbFrom.mockReturnValueOnce(emptyBuilder);
    mocks.createSignedUrl.mockResolvedValueOnce({ data: {}, error: null });

    await expect(
      getEvidenceDownloadUrl({ evidenceId: EVIDENCE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({ data: null, error: "Kunne ikke oprette et sikkert downloadlink." });
  });

  it("fejler lukket ved afviste database- og Storage-promises", async () => {
    const rejectedReadBuilder = createQueryBuilder({
      singleResults: [{ data: null, error: null }],
    });
    rejectedReadBuilder.single.mockRejectedValueOnce(new Error("intern database-detalje"));
    mocks.dbFrom.mockReturnValueOnce(rejectedReadBuilder);

    await expect(
      getEvidenceDownloadUrl({ evidenceId: EVIDENCE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({
      data: null,
      error: "Dokumentationen blev ikke fundet, eller du har ikke adgang til den.",
    });
    expect(mocks.storageFrom).not.toHaveBeenCalled();

    const rejectedStorageBuilder = createQueryBuilder({
      singleResults: [
        {
          data: { id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: EVIDENCE_PATH },
          error: null,
        },
      ],
    });
    mocks.dbFrom.mockReturnValueOnce(rejectedStorageBuilder);
    mocks.createSignedUrl.mockRejectedValueOnce(new Error("intern Storage-detalje"));

    await expect(
      getEvidenceDownloadUrl({ evidenceId: EVIDENCE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({ data: null, error: "Kunne ikke oprette et sikkert downloadlink." });
  });

  it("afviser ugyldige ids uden database- eller Storage-kald", async () => {
    await expect(
      getEvidenceDownloadUrl({ evidenceId: "../../fil", projectId: PROJECT_ID }),
    ).resolves.toEqual({ data: null, error: "Ugyldig dokumentationsreference." });
    expect(mocks.dbFrom).not.toHaveBeenCalled();
    expect(mocks.storageFrom).not.toHaveBeenCalled();
  });

  it("skjuler download-affordance for metadata uden en sikker privat reference", () => {
    expect(
      isEvidenceDownloadAvailable({
        id: EVIDENCE_ID,
        project_id: PROJECT_ID,
        file_url: EVIDENCE_PATH,
      }),
    ).toBe(true);
    expect(
      isEvidenceDownloadAvailable({ id: EVIDENCE_ID, project_id: PROJECT_ID, file_url: null }),
    ).toBe(false);
    expect(
      isEvidenceDownloadAvailable({
        id: "preview-evidence",
        project_id: PROJECT_ID,
        file_url: EVIDENCE_PATH,
      }),
    ).toBe(false);
  });

  it.each(UNSAFE_EVIDENCE_PATH_CASES)("skjuler download-affordance for %s", (_case, fileUrl) => {
    expect(
      isEvidenceDownloadAvailable({
        id: EVIDENCE_ID,
        project_id: PROJECT_ID,
        file_url: fileUrl,
      }),
    ).toBe(false);
  });
});
