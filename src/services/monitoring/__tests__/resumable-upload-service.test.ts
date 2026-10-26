import { describe, expect, it, vi } from "vitest";
import {
  resolveResumableUploadEndpoint,
  TUS_CHUNK_SIZE_BYTES,
  TUS_RETRY_DELAYS_MS,
  uploadWithTus,
} from "@/services/monitoring/resumable-upload-service";

const file = {
  name: "DJI_0001.JPG",
  size: 8 * 1024 * 1024,
  type: "image/jpeg",
  lastModified: 1_777_777_777_000,
} as File;

describe("Supabase resumable endpoint", () => {
  it("uses the direct hosted Storage hostname and preserves local origins", () => {
    expect(resolveResumableUploadEndpoint("https://xdvqdzdpyceojbdknofi.supabase.co")).toBe(
      "https://xdvqdzdpyceojbdknofi.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(resolveResumableUploadEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });
});

describe("TUS transfer contract", () => {
  it("resumes an exact immutable intent with 6 MiB chunks and no upsert", async () => {
    let capturedOptions:
      | {
          endpoint: string;
          headers: Record<string, string>;
          metadata: Record<string, string>;
          chunkSize: number;
          retryDelays: number[];
          fingerprint: (file: File) => Promise<string>;
          onProgress: (sent: number, total: number) => void;
          onSuccess: () => void;
        }
      | undefined;
    const resumeFromPreviousUpload = vi.fn();
    const start = vi.fn(() => {
      capturedOptions?.onProgress(file.size / 2, file.size);
      capturedOptions?.onSuccess();
    });
    const onProgress = vi.fn();

    await uploadWithTus(
      {
        file,
        projectUrl: "https://xdvqdzdpyceojbdknofi.supabase.co",
        accessToken: "jwt-token",
        bucketName: "monitoring-uploads",
        objectName: "user/intents/intent-id/DJI_0001.JPG",
        contentType: "image/jpeg",
        onProgress,
      },
      {
        createUpload: (_file, options) => {
          capturedOptions = options;
          return {
            start,
            abort: vi.fn().mockResolvedValue(undefined),
            findPreviousUploads: vi
              .fn()
              .mockResolvedValue([{ uploadUrl: "https://storage.example/resume/1" }]),
            resumeFromPreviousUpload,
          };
        },
      },
    );

    expect(capturedOptions?.endpoint).toBe(
      "https://xdvqdzdpyceojbdknofi.storage.supabase.co/storage/v1/upload/resumable",
    );
    expect(capturedOptions?.headers).toEqual({ authorization: "Bearer jwt-token" });
    expect(capturedOptions?.headers).not.toHaveProperty("x-upsert");
    expect(capturedOptions?.chunkSize).toBe(TUS_CHUNK_SIZE_BYTES);
    expect(capturedOptions?.retryDelays).toEqual([...TUS_RETRY_DELAYS_MS]);
    expect(capturedOptions?.metadata).toEqual({
      bucketName: "monitoring-uploads",
      objectName: "user/intents/intent-id/DJI_0001.JPG",
      contentType: "image/jpeg",
      cacheControl: "3600",
    });
    await expect(capturedOptions?.fingerprint(file)).resolves.toContain(
      "user/intents/intent-id/DJI_0001.JPG",
    );
    expect(resumeFromPreviousUpload).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(50, file.size / 2, file.size);
  });

  it("pauses the active TUS request when the caller aborts", async () => {
    const controller = new AbortController();
    const abort = vi.fn().mockResolvedValue(undefined);
    const pending = uploadWithTus(
      {
        file,
        projectUrl: "https://xdvqdzdpyceojbdknofi.supabase.co",
        accessToken: "jwt-token",
        bucketName: "monitoring-uploads",
        objectName: "user/intents/intent-id/DJI_0001.JPG",
        contentType: "image/jpeg",
        signal: controller.signal,
      },
      {
        createUpload: () => ({
          start: vi.fn(),
          abort,
          findPreviousUploads: () => new Promise(() => undefined),
          resumeFromPreviousUpload: vi.fn(),
        }),
      },
    );

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(abort).toHaveBeenCalledWith(false);
  });

  it("never starts after abort wins the previous-upload lookup race", async () => {
    const controller = new AbortController();
    const start = vi.fn();
    let resolvePrevious: ((value: Array<{ uploadUrl: string | null }>) => void) | undefined;
    const previousUploads = new Promise<Array<{ uploadUrl: string | null }>>((resolve) => {
      resolvePrevious = resolve;
    });
    const pending = uploadWithTus(
      {
        file,
        projectUrl: "https://xdvqdzdpyceojbdknofi.supabase.co",
        accessToken: "jwt-token",
        bucketName: "monitoring-uploads",
        objectName: "user/intents/intent-id/DJI_0001.JPG",
        contentType: "image/jpeg",
        signal: controller.signal,
      },
      {
        createUpload: () => ({
          start,
          abort: vi.fn().mockResolvedValue(undefined),
          findPreviousUploads: () => previousUploads,
          resumeFromPreviousUpload: vi.fn(),
        }),
      },
    );

    controller.abort();
    resolvePrevious?.([{ uploadUrl: "https://storage.example/resume/late" }]);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    expect(start).not.toHaveBeenCalled();
  });

  it("blocks every HTTP request hook when abort happens after TUS start", async () => {
    const controller = new AbortController();
    let runRequest: (() => Promise<void>) | undefined;
    let requestSent = false;
    const start = vi.fn();
    const pending = uploadWithTus(
      {
        file,
        projectUrl: "https://xdvqdzdpyceojbdknofi.supabase.co",
        accessToken: "jwt-token",
        bucketName: "monitoring-uploads",
        objectName: "user/intents/intent-id/DJI_0001.JPG",
        contentType: "image/jpeg",
        signal: controller.signal,
      },
      {
        createUpload: (_file, options) => ({
          start: () => {
            start();
            runRequest = async () => {
              await options.onBeforeRequest();
              requestSent = true;
            };
          },
          abort: vi.fn().mockResolvedValue(undefined),
          findPreviousUploads: vi.fn().mockResolvedValue([]),
          resumeFromPreviousUpload: vi.fn(),
        }),
      },
    );

    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(runRequest?.()).rejects.toMatchObject({ name: "AbortError" });
    expect(requestSent).toBe(false);
  });
});
