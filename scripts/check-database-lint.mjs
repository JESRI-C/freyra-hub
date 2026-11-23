import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const knownLimitations = new Map([
  [
    "public.st_findextent",
    { sqlState: "55000", message: 'record "myrec" is not assigned yet', maximum: 2 },
  ],
  [
    "public.populate_geometry_columns",
    { sqlState: "55000", message: 'record "gc" is not assigned yet', maximum: 1 },
  ],
  [
    "public.postgis_full_version",
    {
      sqlState: "42883",
      message: "function public.postgis_gdal_version() does not exist",
      maximum: 1,
    },
  ],
  [
    "public.lockrow",
    { sqlState: "42P01", message: 'relation "authorization_table" does not exist', maximum: 1 },
  ],
  [
    "public.addauth",
    { sqlState: "42P01", message: 'relation "temp_lock_have_table" does not exist', maximum: 1 },
  ],
]);

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArray(text, name) {
  if (typeof text !== "string" || text.length > 16 * 1024 * 1024) {
    throw new Error(`${name} must be bounded JSON text`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`);
  return parsed;
}

export function classifyDatabaseLint(lintText, catalogText) {
  const findings = parseArray(lintText, "Database lint");
  const catalog = parseArray(catalogText, "Function ownership catalog");
  if (!catalog.length) throw new Error("Function ownership catalog is empty");

  const overloads = new Map();
  const seenOids = new Set();
  for (const entry of catalog) {
    if (
      !record(entry) ||
      typeof entry.qualifiedName !== "string" ||
      !/^(public|private|storage)\.[a-z_][a-z0-9_]*$/.test(entry.qualifiedName) ||
      typeof entry.oid !== "string" ||
      !/^[1-9][0-9]*$/.test(entry.oid) ||
      typeof entry.identityArguments !== "string" ||
      !["extensionName", "dependencyType", "dependencyRefClass"].every(
        (key) => entry[key] === null || typeof entry[key] === "string",
      ) ||
      seenOids.has(entry.oid)
    ) {
      throw new Error("Function ownership catalog contains an invalid or duplicate row");
    }
    seenOids.add(entry.oid);
    const rows = overloads.get(entry.qualifiedName) ?? [];
    rows.push(entry);
    overloads.set(entry.qualifiedName, rows);
  }

  const vendorLimitations = [];
  const blockingIssues = [];
  const acceptedCounts = new Map();
  for (const finding of findings) {
    if (
      !record(finding) ||
      typeof finding.function !== "string" ||
      !Array.isArray(finding.issues) ||
      !finding.issues.length
    ) {
      throw new Error("Database lint contains an invalid finding");
    }
    for (const issue of finding.issues) {
      if (
        !record(issue) ||
        issue.level !== "error" ||
        typeof issue.message !== "string" ||
        typeof issue.sqlState !== "string"
      ) {
        throw new Error("Database lint contains an invalid error issue");
      }
      const expected = knownLimitations.get(finding.function);
      const rows = overloads.get(finding.function) ?? [];
      let reason;
      if (!expected || issue.sqlState !== expected.sqlState || issue.message !== expected.message) {
        reason = "Unrecognized function, SQL state or lint issue";
      } else if (
        !rows.length ||
        !rows.every(
          (row) =>
            row.extensionName === "postgis" &&
            row.dependencyType === "e" &&
            row.dependencyRefClass === "pg_extension",
        )
      ) {
        reason = "Every overload must have proven PostGIS extension ownership";
      } else if ((acceptedCounts.get(finding.function) ?? 0) >= expected.maximum) {
        reason = "More findings than the documented PostGIS limitation";
      }
      const output = {
        function: finding.function,
        sqlState: issue.sqlState,
        message: issue.message,
      };
      if (reason) {
        blockingIssues.push({ ...output, reason });
      } else {
        acceptedCounts.set(finding.function, (acceptedCounts.get(finding.function) ?? 0) + 1);
        vendorLimitations.push({
          ...output,
          verifiedOverloads: rows.map(({ oid, identityArguments }) => ({ oid, identityArguments })),
        });
      }
    }
  }
  return { ok: blockingIssues.length === 0, vendorLimitations, blockingIssues };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) {
      throw new Error("Usage: node scripts/check-database-lint.mjs LINT_JSON OWNERSHIP_JSON");
    }
    const result = classifyDatabaseLint(
      readFileSync(process.argv[2], "utf8"),
      readFileSync(process.argv[3], "utf8"),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    for (const issue of result.vendorLimitations) {
      process.stderr.write(
        `Known PostGIS static lint limitation: ${issue.function} ${issue.sqlState}: ${issue.message}\n`,
      );
    }
    for (const issue of result.blockingIssues) {
      process.stderr.write(`Blocking database lint: ${issue.function}: ${issue.reason}\n`);
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database lint failure";
    process.stdout.write(`${JSON.stringify({ ok: false, fatalError: message }, null, 2)}\n`);
    process.stderr.write(`Database lint classification failed: ${message}\n`);
    process.exitCode = 1;
  }
}
