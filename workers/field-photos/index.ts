/// <reference path="../../types/field-photo-worker.d.ts" />
import { createClient } from "@supabase/supabase-js";
import { runFieldPhotoBackground } from "./processor";

export default {
  async scheduled(_event: ScheduledController, env: FieldPhotoWorkerEnv) {
    if (env.FIELD_PHOTO_PROCESSING_ENABLED !== "true") {
      console.log(JSON.stringify({ event: "field_photo_tick", enabled: false }));
      return;
    }
    // This worker has a staging-only deployment contract. A copied config
    // cannot accidentally direct its privileged sweeper at production.
    if (
      env.SUPABASE_URL !== "https://xdvqdzdpyceojbdknofi.supabase.co" &&
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(env.SUPABASE_URL)
    )
      throw new Error("Field photo worker environment mismatch");
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
