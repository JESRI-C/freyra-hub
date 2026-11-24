import { beforeEach, describe, expect, it, vi } from "vitest";
const { createClient, runBackground, client } = vi.hoisted(() => ({
  createClient: vi.fn(),
  runBackground: vi.fn(),
  client: {},
}));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("./processor", () => ({ runFieldPhotoBackground: runBackground }));
import worker from "./index";

describe("field photo deployment boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockReturnValue(client);
    runBackground.mockResolvedValue({ claimed: 0 });
  });
  const tick = (environment: string | undefined, url: string) =>
    worker.scheduled(
      {} as ScheduledController,
      {
        FIELD_PHOTO_PROCESSING_ENABLED: "true",
        FIELD_PHOTO_ENVIRONMENT: environment,
        SUPABASE_URL: url,
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-key",
        IMAGES: {},
      } as FieldPhotoWorkerEnv,
    );

  it.each([
    ["production", "https://ikrmcetjutqcjtwfhzfv.supabase.co"],
    ["staging", "https://xdvqdzdpyceojbdknofi.supabase.co"],
    ["riste", "https://mmiqyepkhmvaztnurybf.supabase.co"],
    ["local", "http://127.0.0.1:54321"],
  ])("processes only the database selected by %s", async (environment, url) => {
    await tick(environment, url);
    expect(createClient).toHaveBeenCalledWith(url, "synthetic-server-key", expect.any(Object));
    expect(runBackground).toHaveBeenCalledWith(client, {}, url);
  });

  it.each([
    ["staging", "https://ikrmcetjutqcjtwfhzfv.supabase.co"],
    ["production", "https://xdvqdzdpyceojbdknofi.supabase.co"],
    ["riste", "https://ikrmcetjutqcjtwfhzfv.supabase.co"],
    ["riste", "https://xdvqdzdpyceojbdknofi.supabase.co"],
    ["production", "https://mmiqyepkhmvaztnurybf.supabase.co"],
    ["staging", "https://mmiqyepkhmvaztnurybf.supabase.co"],
    [undefined, "https://mmiqyepkhmvaztnurybf.supabase.co"],
    ["local", "https://mmiqyepkhmvaztnurybf.supabase.co"],
    ["riste", "https://mmiqyepkhmvaztnurybf.supabase.co.attacker.invalid"],
    ["riste", "https://mmiqyepkhmvaztnurybf.supabase.co/redirect"],
    [undefined, "https://ikrmcetjutqcjtwfhzfv.supabase.co"],
    ["local", "https://ikrmcetjutqcjtwfhzfv.supabase.co"],
    ["production", "https://ikrmcetjutqcjtwfhzfv.supabase.co.attacker.invalid"],
    ["local", "http://127.0.0.1:54321/redirect"],
  ])(
    "rejects a mismatched %s deployment before using server credentials",
    async (environment, url) => {
      await expect(tick(environment, url)).rejects.toThrow("environment mismatch");
      expect(createClient).not.toHaveBeenCalled();
      expect(runBackground).not.toHaveBeenCalled();
    },
  );
});
