/** Pure guards: tests supply synthetic URLs and environments only. */
export function assertDisposableLocalConnection(raw, { disposableLocal, usesTunnel = false } = {}) {
  if (!disposableLocal || usesTunnel)
    throw new Error("A physical disposable LOCAL database is required");
  let connection;
  try {
    connection = new URL(raw);
  } catch {
    throw new Error("Invalid explicit LOCAL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(connection.protocol))
    throw new Error("Only a PostgreSQL URL is accepted");
  // Numeric loopback avoids name resolution. Empty query rejects every libpq
  // hostaddr/service/ssl/servicefile and future connection override.
  if (!["127.0.0.1", "[::1]"].includes(connection.hostname))
    throw new Error("Numeric loopback is required");
  if (connection.search !== "" || connection.hash !== "")
    throw new Error("Connection URL overrides are refused");
  if (
    !connection.username ||
    !connection.password ||
    !/^[0-9]+$/.test(connection.port) ||
    Number(connection.port) < 1 ||
    Number(connection.port) > 65535 ||
    !/^\/[a-zA-Z0-9_]+$/.test(connection.pathname)
  )
    throw new Error("Explicit LOCAL user, password, port and database are required");
  return connection;
}

export function localPsqlChildEnvironment(source) {
  // No inherited PGHOSTADDR/PGSERVICE/PGSERVICEFILE/PGPASSFILE/PGPASSWORD,
  // HOME/USERPROFILE or another libpq setting. The URL determines connection.
  const allowed = new Set([
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "LANG",
    "LC_ALL",
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => allowed.has(key) && typeof value === "string"),
  );
}
