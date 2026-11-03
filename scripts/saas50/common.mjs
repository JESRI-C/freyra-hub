import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

assert(process.argv.includes("--staging"), "Explicit --staging required");
export const directory = "tmp/saas50";
export const fixture = JSON.parse(await fs.readFile(`${directory}/fixture.private.json`, "utf8"));
export const env = loadEnv("staging", process.cwd(), "");
assert.equal(fixture.url, "https://xdvqdzdpyceojbdknofi.supabase.co");
assert.equal(env.SUPABASE_URL, fixture.url);
assert.equal(fixture.users.length, 50);
export const outcomes = [];
export const requests = [];
export const clients = new Map();
export const getUser = (tenant, role) =>
  fixture.users.find((u) => u.tenant === tenant && u.role === role);
let saveQueue = Promise.resolve();
export async function saveFixture() {
  saveQueue = saveQueue.then(() =>
    fs.writeFile(`${directory}/fixture.private.json`, JSON.stringify(fixture, null, 2), {
      mode: 0o600,
    }),
  );
  await saveQueue;
}
export function client(user) {
  if (clients.has(user.number)) return clients.get(user.number);
  const fetchImpl = async (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    assert.equal(
      url.origin,
      fixture.url,
      "Test client must stay on the authorized staging backend",
    );
    const start = performance.now();
    try {
      const response = await fetch(input, options);
      requests.push({
        user: user.number,
        path: url.pathname,
        method: options?.method ?? "GET",
        status: response.status,
        milliseconds: Math.round(performance.now() - start),
      });
      return response;
    } catch (error) {
      requests.push({ user: user.number, path: url.pathname, networkError: error.name });
      throw error;
    }
  };
  const sdk = createClient(fixture.url, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchImpl },
  });
  clients.set(user.number, sdk);
  return sdk;
}
export function ok(response, label) {
  if (response.error)
    throw new Error(`${label}: ${response.error.code ?? response.error.status ?? "error"}`);
  return response.data;
}
export async function check(name, user, operation) {
  const start = performance.now();
  const row = { name, user: user?.number ?? null, role: user?.role ?? null };
  try {
    const detail = await operation();
    Object.assign(row, { result: "PASS", detail });
  } catch (error) {
    Object.assign(row, { result: "FAIL", error: error.message.slice(0, 700) });
  }
  row.milliseconds = Math.round(performance.now() - start);
  outcomes.push(row);
  await fs.appendFile(`${directory}/events.private.jsonl`, JSON.stringify(row) + "\n");
  if (row.result === "FAIL") console.log(JSON.stringify(row));
  return row;
}
export async function pool(items, concurrency, action) {
  let cursor = 0;
  return Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        await action(items[index], index);
      }
    }),
  );
}
export async function sessions() {
  const saved = JSON.parse(await fs.readFile(`${directory}/sessions.private.json`, "utf8"));
  await pool(fixture.users, 5, async (user) => {
    assert(saved[user.id], `Missing authenticated session for user ${user.number}`);
    const result = await client(user).auth.setSession(saved[user.id]);
    ok(result, `Restore user ${user.number}`);
    assert.equal(result.data.user.id, user.id);
  });
  return saved;
}
export async function finish(phase) {
  await fs.writeFile(
    `${directory}/${phase}.private.json`,
    JSON.stringify(
      { schema: "freyra.saas50-phase/v1", run: fixture.run, phase, outcomes, requests },
      null,
      2,
    ),
  );
  const fail = outcomes.filter((r) => r.result === "FAIL").length;
  console.log(
    JSON.stringify({
      phase,
      cases: outcomes.length,
      passed: outcomes.length - fail,
      failed: fail,
      requests: requests.length,
    }),
  );
  if (fail) process.exitCode = 1;
}
