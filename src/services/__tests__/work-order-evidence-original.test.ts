import { describe, expect, it, vi } from "vitest";
import { signWorkOrderEvidenceOriginal } from "../work-order-evidence-original.server";
import { actor, id, scope, version } from "./work-order-evidence-fixture";
const pin = () => ({
  ...scope,
  id: version().id,
  actorId: actor,
  original: version().original_snapshot,
});
const input = { ...scope, id: version().id, expectedActorId: actor };
const origin = "https://example.supabase.co";
const url = () =>
  `${origin}/storage/v1/object/sign/project-media/${pin().original.storagePath}?token=synthetic`;
function setup(value = url()) {
  const rpc = vi.fn().mockResolvedValue({ data: pin(), error: null });
  const sign = vi.fn().mockResolvedValue({ data: { signedUrl: value }, error: null });
  const from = vi.fn().mockReturnValue({ createSignedUrl: sign });
  const signer = vi.fn().mockResolvedValue({ storage: { from } });
  return { client: { rpc }, rpc, sign, from, deps: { signer, origin } };
}
describe("exact-reference original signing", () => {
  it("signs only the authorized pinned original for sixty seconds and rechecks access", async () => {
    const s = setup();
    expect(await signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps)).toEqual({
      url: url(),
      expiresIn: 60,
      sha256: "a".repeat(64),
    });
    expect(s.from).toHaveBeenCalledWith("project-media");
    expect(s.sign).toHaveBeenCalledWith(pin().original.storagePath, 60);
    expect(s.rpc).toHaveBeenCalledTimes(2);
  });
  it("does not instantiate the privileged signer before access succeeds", async () => {
    const s = setup();
    s.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(
      signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps),
    ).rejects.toHaveProperty("code", "access");
    expect(s.deps.signer).not.toHaveBeenCalled();
  });
  it("checks actor before any RPC", async () => {
    const s = setup();
    await expect(
      signWorkOrderEvidenceOriginal(s.client, id(2), input, s.deps),
    ).rejects.toHaveProperty("code", "access");
    expect(s.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { projectId: id(22) },
    { actorId: id(2) },
    { actionId: id(32) },
    { id: id(92) },
    { original: { ...pin().original, storagePath: "arbitrary/private-file" } },
  ])("rejects a mismatched authorization response", async (change) => {
    const s = setup();
    s.rpc.mockResolvedValue({ data: { ...pin(), ...change }, error: null });
    await expect(
      signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps),
    ).rejects.toBeInstanceOf(Error);
    expect(s.sign).not.toHaveBeenCalled();
  });
  it("withholds the URL when permission is revoked during signing", async () => {
    const s = setup();
    s.rpc
      .mockResolvedValueOnce({ data: pin(), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps),
    ).rejects.toHaveProperty("code", "access");
    expect(s.sign).toHaveBeenCalledOnce();
  });
  it("withholds the URL when the object identity changes during signing", async () => {
    const s = setup();
    s.rpc.mockResolvedValueOnce({ data: pin(), error: null }).mockResolvedValueOnce({
      data: { ...pin(), original: { ...pin().original, objectVersion: "changed" } },
      error: null,
    });
    await expect(
      signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps),
    ).rejects.toHaveProperty("code", "conflict");
  });
  it.each([
    "https://attacker.test/path",
    url().replace("https:", "http:"),
    url().replace("/original?", "/other?"),
    url().replace("https://", "https://user:pass@"),
    url() + "#fragment",
    url().split("?")[0],
    "malformed",
  ])("rejects unsafe signed URL %s", async (value) => {
    const s = setup(value);
    await expect(
      signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps),
    ).rejects.toHaveProperty("code", "unavailable");
  });
  it("sanitizes unexpected upstream exceptions", async () => {
    const s = setup();
    s.sign.mockRejectedValue(new Error("secret service credential"));
    const error = await signWorkOrderEvidenceOriginal(s.client, actor, input, s.deps).catch(
      (e) => e,
    );
    expect(error.code).toBe("unavailable");
    expect(error.message).not.toContain("secret");
  });
});
