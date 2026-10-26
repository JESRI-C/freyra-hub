import { Upload as TusUpload } from "tus-js-client";

export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
export const TUS_RETRY_DELAYS_MS = [0, 3_000, 5_000, 10_000, 20_000] as const;

interface PreviousUploadLike {
  uploadUrl: string | null;
}

interface TusUploadLike {
  start(): void;
  abort(shouldTerminate?: boolean): Promise<void>;
  findPreviousUploads(): Promise<PreviousUploadLike[]>;
  resumeFromPreviousUpload(previousUpload: PreviousUploadLike): void;
}

interface TusOptionsLike {
  endpoint: string;
  retryDelays: number[];
  headers: Record<string, string>;
  uploadDataDuringCreation: boolean;
  removeFingerprintOnSuccess: boolean;
  chunkSize: number;
  metadata: Record<string, string>;
  fingerprint: (file: File) => Promise<string>;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onBeforeRequest: () => void | Promise<void>;
  onError: (error: Error) => void;
  onSuccess: () => void;
}

export interface ResumableUploadDependencies {
  createUpload?: (file: File, options: TusOptionsLike) => TusUploadLike;
}

export function resolveResumableUploadEndpoint(projectUrl: string): string {
  const parsed = new URL(projectUrl);
  const hostedMatch = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (hostedMatch?.[1]) {
    return `https://${hostedMatch[1]}.storage.supabase.co/storage/v1/upload/resumable`;
  }
  return `${parsed.origin}/storage/v1/upload/resumable`;
}

export async function uploadWithTus(
  params: {
    file: File;
    projectUrl: string;
    accessToken: string;
    bucketName: string;
    objectName: string;
    contentType: string;
    onProgress?: (percentage: number, bytesUploaded: number, bytesTotal: number) => void;
    signal?: AbortSignal;
  },
  dependencies: ResumableUploadDependencies = {},
): Promise<void> {
  if (!params.accessToken) throw new Error("Upload kræver en aktiv session.");
  if (params.signal?.aborted) throw abortError();

  const createUpload =
    dependencies.createUpload ??
    ((file: File, options: TusOptionsLike) => new TusUpload(file, options));

  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      params.signal?.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => {
      void upload
        .abort(false)
        .catch(() => undefined)
        .finally(() => finish(() => reject(abortError())));
    };

    const upload = createUpload(params.file, {
      endpoint: resolveResumableUploadEndpoint(params.projectUrl),
      retryDelays: [...TUS_RETRY_DELAYS_MS],
      headers: { authorization: `Bearer ${params.accessToken}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE_BYTES,
      metadata: {
        bucketName: params.bucketName,
        objectName: params.objectName,
        contentType: params.contentType,
        cacheControl: "3600",
      },
      fingerprint: async (file) =>
        ["gofreyra-tus-v1", params.objectName, file.name, file.size, file.lastModified].join(":"),
      onProgress: (bytesUploaded, bytesTotal) => {
        const percentage = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
        params.onProgress?.(percentage, bytesUploaded, bytesTotal);
      },
      onBeforeRequest: () => {
        if (params.signal?.aborted) throw abortError();
      },
      onError: (error) => finish(() => reject(error)),
      onSuccess: () => finish(resolve),
    });

    params.signal?.addEventListener("abort", handleAbort, { once: true });
    void upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (settled || params.signal?.aborted) return;
        const previous = previousUploads.find((candidate) => Boolean(candidate.uploadUrl));
        if (previous) upload.resumeFromPreviousUpload(previous);
        upload.start();
      })
      .catch((error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error(String(error)))),
      );
  });
}

function abortError(): Error {
  const error = new Error("Uploaden blev sat på pause.");
  error.name = "AbortError";
  return error;
}
