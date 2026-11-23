import { createHash } from "node:crypto";
import { makeFieldPhotoPreview, type FieldPhotoWorkerClient } from "../processor";
import type { FieldPhotoUpload } from "../../../src/lib/field-photo-upload";
export default {
  async fetch(request: Request, env: FieldPhotoWorkerEnv) {
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length > 65536) return new Response("Synthetic fixture too large", { status: 413 });
    let stored: Uint8Array | null = null;
    const upload: FieldPhotoUpload = {
      id: "fa304000-0000-4000-8000-000000000001",
      project_id: "fa302000-0000-4000-8000-000000000001",
      created_by: "fa300000-0000-4000-8000-000000000001",
      created_at: "2026-10-29T00:00:00Z",
      storage_path:
        "fa302000-0000-4000-8000-000000000001/field-uploads/fa304000-0000-4000-8000-000000000001/original",
      received_at: "2026-10-29T00:00:00Z",
      object_id: "fa303000-0000-4000-8000-000000000001",
      object_version: null,
      object_updated_at: "2026-10-29T00:00:00Z",
      payload: {
        title: "Synthetic PNG",
        description: null,
        category: "field_photo",
        tags: [],
        originalName: "synthetic.png",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sizeBytes: bytes.length,
        mimeType: "image/png",
        capturedAt: null,
        capture: {
          schema: "freyra.field-photo/v1",
          originalPosition: null,
          initialPosition: null,
          correctionReason: "",
        },
      },
    };
    const client: FieldPhotoWorkerClient = {
      rpc: async () => {
        throw new Error("No database calls in local decoder smoke test");
      },
      storage: {
        from: (bucket) => ({
          createSignedUrl: async () => ({
            data: {
              signedUrl: `https://synthetic.invalid/storage/v1/object/sign/project-media/${upload.storage_path}?token=synthetic`,
            },
            error: null,
          }),
          upload: async (path, data, options) => {
            if (
              bucket !== "field-photo-previews" ||
              options.upsert !== false ||
              !path.endsWith(".jpg")
            )
              throw new Error("Original write attempted");
            stored = data;
            return { error: null };
          },
          download: async () => ({ data: null, error: new Error("Unexpected download") }),
        }),
      },
    };
    const result = await makeFieldPhotoPreview(
      client,
      env.IMAGES,
      upload,
      "https://synthetic.invalid",
      async () => new Response(bytes.slice().buffer),
    );
    if (!stored) throw new Error("No derivative was stored");
    return new Response(stored, {
      headers: {
        "content-type": "image/jpeg",
        "x-preview-sha256": result.sha256,
        "x-preview-width": String(result.width),
        "x-preview-height": String(result.height),
        "x-source-sha256": upload.payload.sha256,
      },
    });
  },
};
