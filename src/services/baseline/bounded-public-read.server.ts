export class PublicReadError extends Error {
  constructor(readonly code: string) {
    super("Den offentlige kilde kunne ikke hentes.");
  }
}

/** Callers provide fixed provider URLs. No response URL, credential, or upstream body escapes errors. */
export async function readPublicBytes(
  url: URL,
  options: { fetchImpl?: typeof fetch; maxBytes: number; timeoutMs?: number; mediaType: string },
): Promise<Uint8Array> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(15_000, options.timeoutMs ?? 15_000));
  const race = <T>(promise: PromiseLike<T>) =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(new PublicReadError("TIMEOUT"));
      controller.signal.addEventListener("abort", abort, { once: true });
      if (controller.signal.aborted) abort();
      Promise.resolve(promise).then(
        (value) => {
          controller.signal.removeEventListener("abort", abort);
          resolve(value);
        },
        () => {
          controller.signal.removeEventListener("abort", abort);
          reject(new PublicReadError("UNAVAILABLE"));
        },
      );
    });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await race(
      (options.fetchImpl ?? fetch)(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: options.mediaType },
      }),
    );
    if (!response.ok || response.redirected) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicReadError(
        response.status === 401 || response.status === 403 ? "ACCESS_DENIED" : "HTTP_ERROR",
      );
    }
    if (!(response.headers.get("content-type") ?? "").toLowerCase().startsWith(options.mediaType)) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicReadError("INVALID_CONTENT_TYPE");
    }
    if (Number(response.headers.get("content-length")) > options.maxBytes || !response.body) {
      void response.body?.cancel().catch(() => undefined);
      throw new PublicReadError("SIZE_LIMIT");
    }
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const chunk = await race(reader.read());
      if (chunk.done) break;
      total += chunk.value.length;
      if (total > options.maxBytes) throw new PublicReadError("SIZE_LIMIT");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  } finally {
    clearTimeout(timer);
    controller.abort();
    if (reader) {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}

export async function bytesSha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
