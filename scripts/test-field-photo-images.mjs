/** Real offline image decode/resize; synthetic bytes only, no Cloudflare/Supabase API. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import { Miniflare, Log, LogLevel } from "miniflare";

function crc(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    check = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  check.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, check]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(8, 0);
ihdr.writeUInt32BE(4, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const rows = Buffer.alloc(4 * (1 + 8 * 4));
for (let y = 0; y < 4; y++)
  for (let x = 0; x < 8; x++) {
    const p = y * 33 + 1 + x * 4;
    rows[p] = x * 30;
    rows[p + 1] = y * 60;
    rows[p + 2] = 120;
    rows[p + 3] = 255;
  }
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(rows)),
  chunk("IEND", Buffer.alloc(0)),
]);
await mkdir("tmp/field-photo-images", { recursive: true });
const outfile = resolve("tmp/field-photo-images/worker.mjs");
await build({
  entryPoints: ["workers/field-photos/fixtures/images-smoke.ts"],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["workerd", "worker", "browser"],
  external: ["node:crypto"],
  tsconfig: "tsconfig.field-photos.json",
});
const mf = new Miniflare({
  modules: true,
  scriptPath: outfile,
  compatibilityDate: "2026-05-07",
  compatibilityFlags: ["nodejs_compat"],
  images: { binding: "IMAGES" },
  log: new Log(LogLevel.ERROR),
});
try {
  const response = await mf.dispatchFetch("http://synthetic.local/", { method: "POST", body: png });
  const jpeg = new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status, 200, new TextDecoder().decode(jpeg).slice(0, 1000));
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual([...jpeg.slice(0, 2)], [255, 216]);
  assert.equal(
    createHash("sha256").update(jpeg).digest("hex"),
    response.headers.get("x-preview-sha256"),
  );
  assert.equal(
    createHash("sha256").update(png).digest("hex"),
    response.headers.get("x-source-sha256"),
  );
  for (const key of ["x-preview-width", "x-preview-height"])
    assert(Number(response.headers.get(key)) > 0 && Number(response.headers.get(key)) <= 1536);
  console.log(
    JSON.stringify({
      schema: "freyra.field-photo-local-images/v1",
      result: "PASS",
      syntheticOnly: true,
      remote: false,
      inputBytes: png.length,
      outputBytes: jpeg.length,
      width: Number(response.headers.get("x-preview-width")),
      height: Number(response.headers.get("x-preview-height")),
    }),
  );
} finally {
  await mf.dispose();
}
