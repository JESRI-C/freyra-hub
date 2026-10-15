import { describe, expect, it, vi } from "vitest";
import {
  inspectDroneImageBytes,
  sanitizeVisionJpeg,
  DRONE_VISION_MAX_ORIGINAL_BYTES,
  type DroneVisionBindings,
} from "../drone-vision-provider.server";

// Structural JPEG test only. The mocked Images decoder boundary is explicit.
const jpeg = new Uint8Array([
  255, 216, 255, 225, 0, 8, 69, 88, 73, 70, 0, 0, 255, 192, 0, 11, 8, 0, 2, 0, 3, 1, 1, 17, 0, 255,
  218, 0, 2, 0, 255, 217,
]);
const visual = {
  quality: {
    assessment: "limited",
    issues: ["partial_view"],
    limitation: "En del af området ses ikke.",
  },
  watercourseVisibility: "uncertain",
  features: [],
  overallUncertainty: "Der mangler udsyn til vandløbet.",
};
function bindings(options: { response?: Response; image?: Uint8Array } = {}) {
  const run = vi.fn().mockResolvedValue(
    options.response ??
      Response.json({
        choices: [{ finish_reason: "stop", message: { content: JSON.stringify(visual) } }],
      }),
  );
  const output = vi
    .fn()
    .mockResolvedValue({ response: () => new Response((options.image ?? jpeg).slice().buffer) });
  const transform = vi.fn().mockReturnValue({ output });
  const input = vi.fn().mockReturnValue({ transform });
  return {
    bindings: { AI: { run }, IMAGES: { input } } as unknown as DroneVisionBindings,
    run,
    output,
    transform,
    input,
  };
}
describe("private original to bounded vision derivative", () => {
  it("strips metadata and derives dimensions from transformed JPEG bytes", () => {
    const clean = sanitizeVisionJpeg(jpeg);
    expect(new TextDecoder().decode(clean.bytes)).not.toContain("EXIF");
    expect(clean.widthPx).toBe(3);
    expect(clean.heightPx).toBe(2);
    expect(clean.bytes.length).toBe(jpeg.length - 10);
  });
  it("strips APP/COM metadata between progressive scans before model handoff", async () => {
    const app = new TextEncoder().encode("GPS_SERIAL_SECRET");
    const comment = new TextEncoder().encode("PRIVATE_COMMENT");
    const betweenScans = new Uint8Array([
      ...jpeg.subarray(0, -2),
      255,
      225,
      0,
      app.length + 2,
      ...app,
      255,
      254,
      0,
      comment.length + 2,
      ...comment,
      255,
      218,
      0,
      2,
      0x12,
      255,
      0,
      0x34,
      255,
      208,
      0x56,
      255,
      217,
    ]);
    betweenScans[13] = 0xc2; // Same transformed-image container, progressive SOF.
    const clean = sanitizeVisionJpeg(betweenScans);
    const cleanText = new TextDecoder().decode(clean.bytes);
    expect(cleanText).not.toMatch(/EXIF|GPS_SERIAL_SECRET|PRIVATE_COMMENT/);
    const hex = [...clean.bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    expect(hex).toContain("12ff0034ffd056"); // Stuffed data/restart bytes stay intact.
    expect(hex.match(/ffda/g)).toHaveLength(2);
    const mocks = bindings({ image: betweenScans });
    await inspectDroneImageBytes(jpeg, mocks);
    const modelImage = mocks.run.mock.calls[0][1].messages[1].content[1].image_url.url;
    expect(atob(modelImage.split(",")[1])).not.toMatch(/EXIF|GPS_SERIAL_SECRET|PRIVATE_COMMENT/);
  });
  it("rejects trailing payload, missing EOI and truncated post-scan metadata", () => {
    for (const invalid of [
      new Uint8Array([...jpeg, 1]),
      jpeg.subarray(0, -1),
      new Uint8Array([...jpeg.subarray(0, -2), 255, 225, 0, 20, 1, 255, 217]),
    ])
      expect(() => sanitizeVisionJpeg(invalid)).toThrow("Originalen kunne ikke afkodes");
  });
  it("passes only stripped inline image bytes and fixed instructions to the provider", async () => {
    const mocks = bindings();
    const result = await inspectDroneImageBytes(jpeg, mocks);
    expect(result.visual).toEqual(visual);
    expect(result.derivative.widthPx).toBe(3);
    expect(result.derivative.sha256).toMatch(/^[a-f0-9]{64}$/);
    const args = mocks.run.mock.calls[0];
    expect(args[1]).toMatchObject({
      stream: false,
      store: false,
      tool_choice: "none",
      max_completion_tokens: 2400,
    });
    expect(JSON.stringify(args[1])).not.toContain("supabase");
    expect(args[1].messages[1].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(mocks.transform).toHaveBeenCalledWith({ width: 1536, height: 1536, fit: "scale-down" });
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("rejects large originals before any transform or inference", async () => {
    const mocks = bindings();
    await expect(
      inspectDroneImageBytes(new Uint8Array(DRONE_VISION_MAX_ORIGINAL_BYTES + 1), mocks),
    ).rejects.toMatchObject({ code: "image_size" });
    expect(mocks.input).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("requires an actual decoded/reencoded supported image", async () => {
    const mocks = bindings({ image: new Uint8Array([255, 216, 0, 0, 255, 217]) });
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({
      code: "invalid_image",
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([
    { choices: [{ finish_reason: "length", message: { content: JSON.stringify(visual) } }] },
    { choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] },
    {
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify({ ...visual, approved: true }) },
        },
      ],
    },
  ])("rejects incomplete, malformed or extra output without raw provider text", async (body) => {
    const mocks = bindings({ response: Response.json(body) });
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
  it("bounds the response even with no declared length", async () => {
    const mocks = bindings({ response: new Response("x".repeat(65537)) });
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({
      code: "invalid_output",
    });
  });
  it("sanitizes upstream exceptions and never retries inference", async () => {
    const mocks = bindings();
    mocks.run.mockRejectedValue(new Error("secret provider payload"));
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toThrow(
      "Billed-AI kunne ikke fuldføre analysen",
    );
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("aborts an overdue inference", async () => {
    const mocks = bindings();
    mocks.run.mockImplementation(
      (_model, _input, opts) =>
        new Promise((_resolve, reject) =>
          opts.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        ),
    );
    await expect(inspectDroneImageBytes(jpeg, { ...mocks, timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
  });
  it("cancels a stalled transformed image and never starts late inference", async () => {
    const mocks = bindings();
    const cancel = vi.fn();
    mocks.output.mockResolvedValue({
      response: () => new Response(new ReadableStream({ cancel })),
    });
    await expect(inspectDroneImageBytes(jpeg, { ...mocks, timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("cancels a stalled inference body at the same deadline", async () => {
    const cancel = vi.fn();
    const mocks = bindings({ response: new Response(new ReadableStream({ cancel })) });
    await expect(inspectDroneImageBytes(jpeg, { ...mocks, timeoutMs: 20 })).rejects.toMatchObject({
      code: "timeout",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledTimes(1);
  });
  it("reauthorizes after transformation before transferring pixels to inference", async () => {
    const mocks = bindings();
    const beforeModelTransfer = vi.fn().mockRejectedValue(new Error("access revoked"));
    await expect(inspectDroneImageBytes(jpeg, { ...mocks, beforeModelTransfer })).rejects.toThrow();
    expect(beforeModelTransfer).toHaveBeenCalledTimes(1);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
