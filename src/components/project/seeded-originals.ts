import type { CanonicalDroneBatch } from "@/components/monitoring/DroneBeforeBatchWizard";

/** Stop between every async boundary when navigation, identity or access changes. */
export async function prepareSeededOriginals(input: {
  projectId: string;
  actorId: string;
  uploadIds: string[];
  isCurrent(): boolean;
  onProgress(value: string): void;
  validate(input: { data: { projectId: string; uploadId: string } }): Promise<unknown>;
  promote(input: {
    data: { projectId: string; uploadId: string; requestId: string };
  }): Promise<{ mediaId: string }>;
}): Promise<CanonicalDroneBatch | null> {
  const mediaIds: string[] = [];
  for (const [index, uploadId] of input.uploadIds.entries()) {
    if (!input.isCurrent()) return null;
    input.onProgress(`Kontrollerer original ${index + 1} af ${input.uploadIds.length} …`);
    await input.validate({ data: { projectId: input.projectId, uploadId } });
    if (!input.isCurrent()) return null;
    const digest = [
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            `seed-promotion:${input.actorId}:${input.projectId}:${uploadId}`,
          ),
        ),
      ),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    if (!input.isCurrent()) return null;
    const requestId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const result = await input.promote({
      data: { projectId: input.projectId, uploadId, requestId },
    });
    if (!input.isCurrent()) return null;
    mediaIds.push(result.mediaId);
  }
  return input.isCurrent()
    ? {
        projectId: input.projectId,
        batchId: "haderslev-seed-2710",
        mediaIds: [...new Set(mediaIds)],
        receivedCount: input.uploadIds.length,
      }
    : null;
}
