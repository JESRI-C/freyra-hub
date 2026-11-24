import { assertDisposableLocalConnection } from "../database-concurrency/local-database-guard.mjs";

export function assertPostgisProbeTarget({ ci, args, apiUrl, databaseUrl }) {
  if (ci !== "true" || args.length !== 1 || args[0] !== "--disposable-local")
    throw new Error("Use this probe only in CI with --disposable-local.");
  if (
    apiUrl !== "http://127.0.0.1:54321" ||
    databaseUrl !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  )
    throw new Error("Refusing a database other than the disposable local stack.");
  assertDisposableLocalConnection(databaseUrl, { disposableLocal: true });
  return databaseUrl;
}

/** Compare pg_dump's table contracts and COPY data without changing stored values. */
export function canonicalPostgisDump(text, kind) {
  if (kind !== "schema" && kind !== "data") throw new Error("Unknown dump kind.");
  const result = [];
  let copy = null;
  const copies = new Set();
  for (const line of text.replaceAll("\r\n", "\n").split("\n")) {
    if (copy) {
      if (line === "\\.") {
        result.push(...copy.sort(), line);
        copy = null;
      } else copy.push(line);
      continue;
    }
    // PostgreSQL's per-dump random guard is not a database property.
    if (/^\\(?:un)?restrict \S+$/.test(line)) continue;
    if (kind === "data" && /^COPY .* FROM stdin;$/.test(line)) {
      const target =
        /^COPY public\.(geo_features|geo_observations|project_areas) \(.+\) FROM stdin;$/.exec(
          line,
        )?.[1];
      if (!target || copies.has(target)) throw new Error("Unexpected COPY target.");
      copies.add(target);
      result.push(line);
      copy = [];
      continue;
    }
    result.push(
      kind === "schema" ? line.replaceAll("public.geometry(", "extensions.geometry(") : line,
    );
  }
  if (copy || (kind === "data" && copies.size !== 3))
    throw new Error("Incomplete COPY dump of the three checked tables.");
  return result.join("\n");
}
