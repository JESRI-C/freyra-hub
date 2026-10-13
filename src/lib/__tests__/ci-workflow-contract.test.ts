import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8").replace(
  /\r\n/g,
  "\n",
);

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
      "supabase db lint --local --schema public,storage --level error --fail-on error",
    );
    expect(workflow).not.toMatch(/--(?:linked|db-url)\b/);
    expect(workflow).toContain("if: always()\n        run: supabase stop --no-backup");
  });
});
