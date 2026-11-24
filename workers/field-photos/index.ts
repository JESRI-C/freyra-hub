import { createClient } from "@supabase/supabase-js";
import { runFieldPhotoBackground } from "./processor";

export default {
  async scheduled(_event: ScheduledController, env: FieldPhotoWorkerEnv) {
    if (env.FIELD_PHOTO_PROCESSING_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "field_photo_tick", enabled: false }));
      return;
    }
    // A deployment must explicitly select its database. Copying staging
    // configuration cannot direct its privileged sweeper at production.
    const matchesEnvironment =
      (env.FIELD_PHOTO_ENVIRONMENT === "production" &&
        env.SUPABASE_URL === "https://ikrmcetjutqcjtwfhzfv.supabase.co") ||
      (env.FIELD_PHOTO_ENVIRONMENT === "staging" &&
        env.SUPABASE_URL === "https://xdvqdzdpyceojbdknofi.supabase.co") ||
      (env.FIELD_PHOTO_ENVIRONMENT === "riste" &&
        env.SUPABASE_URL === "https://mmiqyepkhmvaztnurybf.supabase.co") ||
      (env.FIELD_PHOTO_ENVIRONMENT === "local" &&
        /^http:\/\/127\.0\.0\.1:\d+$/.test(env.SUPABASE_URL));
    if (!matchesEnvironment) throw new Error("Field photo worker environment mismatch");
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }),
      },
    });
    const counts = await runFieldPhotoBackground(client, env.IMAGES, env.SUPABASE_URL);
    console.log(JSON.stringify({ event: "field_photo_tick", enabled: true, ...counts }));
  },
  fetch() {
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<FieldPhotoWorkerEnv>;
