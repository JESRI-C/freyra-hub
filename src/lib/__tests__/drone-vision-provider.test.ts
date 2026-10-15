import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inspectDroneImageBytes,
  sanitizeVisionJpeg,
  DRONE_VISION_MAX_ORIGINAL_BYTES,
  DRONE_VISION_TIMEOUT_MS,
  DRONE_VISION_MODEL,
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
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
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
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(args[0]).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(result.model).toBe(DRONE_VISION_MODEL);
    expect(args[1]).not.toHaveProperty("reasoning_effort");
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
  it.each([
    {
      body: "not JSON",
      expected: {
        finishReason: "missing",
        contentLength: null,
        envelopeJson: "invalid",
        envelopeSchema: "not_attempted",
        contentJson: "not_attempted",
        visualSchema: "not_attempted",
      },
    },
    {
      body: JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "{}" } }],
      }),
      expected: {
        finishReason: "length",
        contentLength: 2,
        envelopeJson: "valid",
        envelopeSchema: "invalid",
        contentJson: "not_attempted",
        visualSchema: "not_attempted",
      },
    },
    {
      body: JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "not JSON" } }],
      }),
      expected: {
        finishReason: "stop",
        contentLength: 8,
        envelopeJson: "valid",
        envelopeSchema: "valid",
        contentJson: "invalid",
        visualSchema: "not_attempted",
      },
    },
    {
      body: JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "{}" } }],
      }),
      expected: {
        finishReason: "stop",
        contentLength: 2,
        envelopeJson: "valid",
        envelopeSchema: "valid",
        contentJson: "valid",
        visualSchema: "invalid",
      },
    },
  ])(
    "distinguishes output failure boundaries using only bounded scalar diagnostics",
    async ({ body, expected }) => {
      const mocks = bindings({ response: new Response(body) });
      await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({
        code: "invalid_output",
      });
      expect(console.info).toHaveBeenCalledWith(
        "drone_vision_timing",
        expect.objectContaining({
          outcome: "invalid_output",
          phase: "output_validation",
          output: expected,
        }),
      );
    },
  );
  it("replaces unexpected finish reasons and never logs invalid output prose or schema keys", async () => {
    const mocks = bindings({
      response: Response.json({
        choices: [
          {
            finish_reason: "https://private.test/secret\n",
            message: { content: "SECRET_MODEL_PROSE" },
          },
        ],
        private_extra_schema_key: "secret",
      }),
    });
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({
      code: "invalid_output",
    });
    const diagnostic = vi.mocked(console.info).mock.calls[0];
    expect(diagnostic[1].output).toMatchObject({
      finishReason: "other",
      contentLength: 18,
      envelopeSchema: "invalid",
    });
    expect(JSON.stringify(diagnostic)).not.toMatch(/secret|https:|SECRET|private_extra_schema_key/);
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
    expect(console.info).toHaveBeenCalledWith(
      "drone_vision_timing",
      expect.objectContaining({ outcome: "timeout", phase: "ai_inference" }),
    );
  });
  it("allows a slow single inference to finish after the old deadline", async () => {
    vi.useFakeTimers();
    const mocks = bindings();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    mocks.run.mockImplementation(() => {
      markStarted();
      return new Promise((resolve) => {
        setTimeout(
          () =>
            resolve(
              Response.json({
                choices: [{ finish_reason: "stop", message: { content: JSON.stringify(visual) } }],
              }),
            ),
          90_000,
        );
      });
    });
    let settled = false;
    const pending = inspectDroneImageBytes(jpeg, mocks).then((result) => {
      settled = true;
      return result;
    });
    await started;
    await vi.advanceTimersByTimeAsync(66_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(24_000);
    await expect(pending).resolves.toMatchObject({ visual });
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(DRONE_VISION_TIMEOUT_MS).toBe(100_000);
    expect(console.info).toHaveBeenCalledWith(
      "drone_vision_timing",
      expect.objectContaining({
        outcome: "completed",
        phase: "output_validation",
        elapsedMs: 90_000,
      }),
    );
  });
  it("logs bounded phase timings without payloads, URLs or image identifiers", async () => {
    const mocks = bindings();
    mocks.run.mockRejectedValue(new Error("secret provider payload https://private.test/image"));
    await expect(inspectDroneImageBytes(jpeg, mocks)).rejects.toMatchObject({ code: "provider" });
    const diagnostic = vi.mocked(console.info).mock.calls[0];
    expect(diagnostic[0]).toBe("drone_vision_timing");
    expect(Object.keys(diagnostic[1]).sort()).toEqual(["elapsedMs", "outcome", "phase", "phaseMs"]);
    expect(diagnostic[1]).toMatchObject({ outcome: "provider", phase: "ai_inference" });
    expect(JSON.stringify(diagnostic)).not.toMatch(/secret|https:|EXIF|sha256|project|mediaId/);
    expect(
      Object.values(diagnostic[1].phaseMs).every(
        (value) => Number.isFinite(value) && Number(value) >= 0,
      ),
    ).toBe(true);
    expect(console.info).toHaveBeenCalledTimes(1);
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
    expect(console.info).toHaveBeenCalledWith(
      "drone_vision_timing",
      expect.objectContaining({ outcome: "timeout", phase: "image_body" }),
    );
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
    expect(console.info).toHaveBeenCalledWith(
      "drone_vision_timing",
      expect.objectContaining({ outcome: "timeout", phase: "ai_body" }),
    );
  });
  it("reauthorizes after transformation before transferring pixels to inference", async () => {
    const mocks = bindings();
    const beforeModelTransfer = vi.fn().mockRejectedValue(new Error("access revoked"));
    await expect(inspectDroneImageBytes(jpeg, { ...mocks, beforeModelTransfer })).rejects.toThrow();
    expect(beforeModelTransfer).toHaveBeenCalledTimes(1);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
