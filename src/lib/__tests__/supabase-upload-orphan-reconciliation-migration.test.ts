import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260902153933_reconcile_upload_intent_orphans.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase().replace(/\s+/g, " ").trim();

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
    expect(sql).toContain("upload_intent_orphan_cleanup_claim_pair");
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
    expect(sql).toContain("on conflict (upload_id) do update");
    expect(sql).toContain("lease.attempts + 1");
  });

  it("uses an expiring opaque lease and rejects stale completion", () => {
    expect(sql).toContain("pg_catalog.make_interval(secs => bounded_lease_seconds)");
    expect(sql).toContain("pg_catalog.gen_random_uuid()");
    expect(sql).toContain(
      "create or replace function public.complete_upload_intent_orphan_cleanup(",
    );
    expect(sql).toContain("lease.claim_token = p_claim_token");
    expect(sql).toContain("upload cleanup claim is missing or stale");
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
