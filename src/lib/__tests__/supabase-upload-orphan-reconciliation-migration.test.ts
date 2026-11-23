import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260902153933_reconcile_upload_intent_orphans.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase().replace(/\s+/g, " ").trim();
const claimFixMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260912110614_fix_upload_orphan_claim_conflict.sql",
);
const claimFixSql = readFileSync(claimFixMigrationPath, "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();
const forwardReconciliationMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260912112500_upload_intent_forward_reconciliation.sql",
);
const forwardReconciliationSql = readFileSync(forwardReconciliationMigrationPath, "utf8")
  .toLowerCase()
  .replace(/\s+/g, " ")
  .trim();

describe("upload-intent orphan reconciliation migration", () => {
  it("keeps lease state private and inaccessible to Data API roles", () => {
    expect(sql).toContain("create table if not exists private.upload_intent_orphan_cleanup_leases");
    expect(sql).toContain(
      "alter table private.upload_intent_orphan_cleanup_leases enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table private.upload_intent_orphan_cleanup_leases from public, anon, authenticated, service_role",
    );
    expect(sql).toContain("references public.uploads(id) on delete restrict");
    expect(sql).toContain("lease_expires_at timestamptz");
    expect(sql).toContain("upload_intent_orphan_cleanup_claim_state");
    expect(sql).toContain("lease_expires_at > claimed_at");
    expect(sql).toContain("upload_intent_orphan_cleanup_completed_unclaimed");
    expect(sql).toContain("create or replace function private.reject_upload_intent_delete()");
    expect(sql).toContain("create trigger upload_intent_delete_rejected");
    expect(sql).toContain("when (old.intent_request_id is not null and old.received_at is null)");
    expect(sql).toContain("create policy uploads_delete on public.uploads");
    expect(sql).toContain("(intent_request_id is null or received_at is not null)");
  });

  it("claims only cancelled or expired unreceived upload intents", () => {
    expect(sql).toContain("create or replace function public.claim_upload_intent_orphans(");
    expect(sql).toContain("upload.intent_request_id is not null");
    expect(sql).toContain("upload.received_at is null");
    expect(sql).toContain("upload.status = 'archived'");
    expect(sql).toContain("upload.status = 'draft'");
    expect(sql).toContain("upload.intent_expires_at <= pg_catalog.now()");
    expect(sql).toContain("for update of upload skip locked");
    expect(sql).toContain("limit bounded_limit");
    expect(sql).toContain(
      "on conflict on constraint upload_intent_orphan_cleanup_leases_pkey do update",
    );
    expect(sql).toContain("lease.attempts + 1");
  });

  it("avoids RETURNS TABLE ambiguity in fresh and already-applied databases", () => {
    for (const migrationSql of [sql, claimFixSql, forwardReconciliationSql]) {
      expect(migrationSql).toContain(
        "on conflict on constraint upload_intent_orphan_cleanup_leases_pkey do update",
      );
      expect(migrationSql).not.toContain("on conflict (upload_id)");
    }

    expect(claimFixSql.match(/create or replace function/g)).toHaveLength(1);
    expect(claimFixSql).toContain("create or replace function public.claim_upload_intent_orphans(");
    expect(claimFixSql).not.toMatch(/\b(?:create|alter|drop) table\b/);
    expect(claimFixSql).not.toMatch(/\b(?:grant|revoke)\b/);
    expect(forwardReconciliationSql.match(/create or replace function/g)).toHaveLength(3);
  });

  it("forward-reconciles lease state for databases with recorded historical migrations", () => {
    expect(forwardReconciliationSql).toContain(
      "alter table private.upload_intent_orphan_cleanup_leases add column if not exists lease_expires_at timestamptz",
    );
    expect(forwardReconciliationSql).toContain(
      "drop constraint if exists upload_intent_orphan_cleanup_claim_pair",
    );
    expect(forwardReconciliationSql).toContain(
      "drop constraint if exists upload_intent_orphan_cleanup_claim_state",
    );
    expect(forwardReconciliationSql).toContain(
      "drop constraint if exists upload_intent_orphan_cleanup_completed_unclaimed",
    );
    expect(forwardReconciliationSql).toContain("then lease.claimed_at + interval '300 seconds'");
    expect(forwardReconciliationSql).toContain(
      "add constraint upload_intent_orphan_cleanup_claim_state",
    );
    expect(forwardReconciliationSql).toContain(
      "add constraint upload_intent_orphan_cleanup_completed_unclaimed",
    );
    expect(forwardReconciliationSql).toContain(
      "drop index if exists private.upload_intent_orphan_cleanup_available_idx",
    );
    expect(forwardReconciliationSql).toContain(
      "on private.upload_intent_orphan_cleanup_leases (lease_expires_at, upload_id)",
    );
  });

  it("carries forward received-object reads and safe cancellation", () => {
    expect(forwardReconciliationSql).toContain(
      "create or replace function private.can_read_monitoring_object(_object_name text)",
    );
    expect(forwardReconciliationSql).toContain(
      "upload.status not in ('draft', 'archived') and upload.received_at is not null",
    );
    expect(forwardReconciliationSql).toContain(
      "create or replace function public.cancel_upload_intent(p_upload_id uuid)",
    );
    expect(forwardReconciliationSql).toContain("if intent.intent_request_id is null");
    expect(forwardReconciliationSql).toContain("or intent.received_at is not null");
    expect(forwardReconciliationSql).toContain("or intent.status <> 'draft' then");
    expect(forwardReconciliationSql).not.toMatch(
      /(?:insert\s+into|update|delete\s+from)\s+storage\.objects/,
    );
  });

  it("uses an expiring opaque lease and rejects stale completion", () => {
    expect(sql).toContain(
      "pg_catalog.now() + pg_catalog.make_interval(secs => bounded_lease_seconds)",
    );
    expect(sql).toContain("lease.lease_expires_at <= pg_catalog.now()");
    expect(sql).not.toContain(
      "lease.claimed_at <= pg_catalog.now() - pg_catalog.make_interval(secs => bounded_lease_seconds)",
    );
    expect(sql).toContain("pg_catalog.gen_random_uuid()");
    expect(sql).toContain(
      "create or replace function public.complete_upload_intent_orphan_cleanup(",
    );
    expect(sql).toContain("lease.claim_token = p_claim_token");
    expect(sql).toContain("upload cleanup claim is missing or stale");
    expect(sql).toContain("lease_expires_at = null");
    expect(sql).toContain("pg_catalog.left(");
    expect(sql).toContain("1000");
  });

  it("exposes both RPCs to service_role only and never edits Storage metadata", () => {
    expect(sql).toContain(
      "revoke all on function public.claim_upload_intent_orphans(integer, integer) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.claim_upload_intent_orphans(integer, integer) to service_role",
    );
    expect(sql).toContain(
      "revoke all on function public.complete_upload_intent_orphan_cleanup(uuid, uuid, text) from public, anon, authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.complete_upload_intent_orphan_cleanup(uuid, uuid, text) to service_role",
    );
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+storage\.objects/);
  });
});
