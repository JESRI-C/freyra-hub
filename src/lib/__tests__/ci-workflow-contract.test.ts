import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseConfigFileTextToJson } from "typescript";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8").replace(
  /\r\n/g,
  "\n",
);

interface WranglerEnvironmentContract {
  name?: string;
  secrets?: { required?: string[] };
  vars?: Record<string, unknown>;
}

// Parse only the checked-in config; JSONC formatting permits comments/trailing commas.
const parsedConfig = parseConfigFileTextToJson(
  "wrangler.jsonc",
  readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf8"),
);
if (parsedConfig.error) throw new Error("Staging Wrangler configuration is invalid JSONC");
const wranglerConfig = parsedConfig.config as WranglerEnvironmentContract & {
  env: Record<string, WranglerEnvironmentContract>;
};

const wranglerSchema = JSON.parse(
  readFileSync(resolve(process.cwd(), "node_modules/wrangler/config-schema.json"), "utf8"),
) as {
  definitions: {
    RawEnvironment: {
      properties: {
        secrets: { properties: { required: { type: string; items: { type: string } } } };
      };
    };
  };
};

describe("P0 app-gates workflow", () => {
  it("cannot deploy or receive repository secrets", () => {
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toMatch(/\bsecrets\./);
    expect(workflow).not.toMatch(/\b(?:deploy|wrangler|supabase\s+db\s+push)\b/i);
  });

  it("runs only for reviews, manual checks and accepted main changes", () => {
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).toMatch(/push:\n\s+branches:\n\s+- main/);
    expect(workflow).not.toContain("codex/gofreyra-p0");
  });

  it("uses the reproducible npm gates without staging credentials", () => {
    expect(workflow).toContain("node-version: 22.14.0");
    expect(workflow).toContain("npm ci --no-audit --no-fund");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("npm run lint");
    expect(workflow).toContain("npm run verify:faktorer");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("npm test -- --maxWorkers=1 --no-file-parallelism");
    expect(workflow).toContain("npm run build");
    expect(workflow).not.toContain("build:staging");
  });

  it("replays and tests a disposable local database without touching a linked project", () => {
    expect(workflow).toContain("database-gates:");
    expect(workflow).toContain("version: 2.116.0");
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase test db --local supabase/tests/database");
    expect(workflow).toContain(
      "supabase db lint --local --schema public,private,storage --level error --fail-on none",
    );
    expect(workflow).not.toMatch(/--(?:linked|db-url)\b/);
    expect(workflow).toContain("if: always()\n        run: supabase stop --no-backup");
  });

  it("classifies lint only against the same local database and preserves evidence", () => {
    expect(workflow).toContain("set -euo pipefail");
    expect(workflow).toContain(
      "--host=127.0.0.1 --port=54322 --dbname=postgres --username=postgres",
    );
    expect(workflow).toContain("--no-psqlrc --set=ON_ERROR_STOP=1");
    expect(workflow).toContain("FROM pg_catalog.pg_proc routine");
    expect(workflow).toContain("dependency.classid = 'pg_catalog.pg_proc'::regclass");
    expect(workflow).toContain("dependency.deptype = 'e'");
    expect(workflow).toContain("dependency.refclassid = 'pg_catalog.pg_extension'::regclass");
    expect(workflow).toContain("LEFT JOIN pg_catalog.pg_extension");
    expect(workflow).toContain("WHERE namespace.nspname IN ('public', 'private', 'storage')");
    expect(workflow).toContain("node scripts/check-database-lint.mjs");
    expect(workflow).toContain("uses: actions/upload-artifact@v4");
    expect(workflow).not.toMatch(/continue-on-error|\|\|\s*true/);
  });
});

describe("P0 staging deploy configuration", () => {
  it("requires caller-auth, writer and official source bindings in the named staging environment", () => {
    expect(wranglerConfig.env.staging.name).toBe("gofreyra-p0-staging");
    expect(wranglerConfig.env.staging.secrets?.required).toEqual([
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATAFORDELER_API_KEY",
    ]);
    // Secrets are non-inheritable; moving this to the default environment loses the safeguard.
    expect(wranglerConfig.secrets).toBeUndefined();
    // Cron/ingest are separate gates and are not needed for this writer deployment.
    expect(wranglerConfig.env.staging.secrets?.required).not.toContain(
      "OBSERVATIONS_INGEST_API_SECRET",
    );
    expect(wranglerConfig.env.staging.secrets?.required).not.toContain(
      "MONITORING_CRON_API_SECRET",
    );
  });

  it("keeps the privileged binding out of plaintext/browser variables", () => {
    for (const config of [wranglerConfig, wranglerConfig.env.staging]) {
      expect(config.vars ?? {}).not.toHaveProperty("SUPABASE_SERVICE_ROLE_KEY");
      expect(config.vars ?? {}).not.toHaveProperty("VITE_SUPABASE_SERVICE_ROLE_KEY");
      expect(config.vars ?? {}).not.toHaveProperty("DATAFORDELER_API_KEY");
      expect(config.vars ?? {}).not.toHaveProperty("VITE_DATAFORDELER_API_KEY");
    }
  });

  it("uses the installed Wrangler schema's supported named-environment secret declaration", () => {
    const required =
      wranglerSchema.definitions.RawEnvironment.properties.secrets.properties.required;
    expect(required.type).toBe("array");
    expect(required.items.type).toBe("string");
  });
});
