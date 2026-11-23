import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { directory, fixture, client, pool, check, finish } from "./common.mjs";

const meta = await fetch(fixture.app + "/freyra-build.json").then((r) => r.json());
assert.equal(meta.sourceRevision, fixture.sourceRevision);
const saved = {};
// These are independent users, not fifty copies of an administrator session.
await pool(fixture.users, 5, async (user) => {
  await check("distinct-password-login", user, async () => {
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await client(user).auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      if (response.error?.status !== 429) break;
      // Respect a rate limit; do not retry in a tight loop or change provider settings.
      await new Promise((resolve) => setTimeout(resolve, 15_000 * (attempt + 1)));
    }
    assert(!response.error, `Login failed: ${response.error?.code ?? response.error?.status}`);
    assert.equal(response.data.user.id, user.id);
    assert.equal(response.data.user.app_metadata.qa_tag, fixture.qaTag);
    saved[user.id] = response.data.session;
    await fs.writeFile(`${directory}/sessions.private.json`, JSON.stringify(saved, null, 2), {
      mode: 0o600,
    });
    return { distinctIdentity: true };
  });
});
assert.equal(Object.keys(saved).length, 50, "All fifty users must authenticate; no reduced sample");
assert.equal(new Set(Object.values(saved).map((s) => s.user.id)).size, 50);
await finish("authenticate");
