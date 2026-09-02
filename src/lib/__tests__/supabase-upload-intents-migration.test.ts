import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260901163924_upload_intents_resumable_storage.sql",
);
const sql = readFileSync(migrationPath, "utf8").toLowerCase().replace(/\s+/g, " ").trim();

describe("monitoring upload-intent migration", () => {
  it("makes the server the only issuer of expiring upload paths", () => {
    expect(sql).toContain("add column if not exists intent_expires_at timestamptz");
    expect(sql).toContain("add column if not exists intent_request_id uuid");
    expect(sql).toContain("add column if not exists received_at timestamptz");
    expect(sql).toContain("upload.intent_request_id is null and upload.status = 'draft'");
    expect(sql).toContain("object.name = upload.storage_path");
    expect(sql).toContain("uploads_intent_request_id_uidx");
    expect(sql).toContain("revoke insert on table public.uploads from authenticated");
    expect(sql).toContain("create or replace function public.create_upload_intent(");
    expect(sql).toContain("security definer set search_path = ''");
    expect(sql).toContain("actor_id uuid := auth.uid()");
    expect(sql).toContain("intent_id uuid := pg_catalog.gen_random_uuid()");
    expect(sql).toContain("p_client_request_id uuid");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql).toContain("upload.intent_request_id = p_client_request_id");
    expect(sql).toContain("p_project_id::text || ':upload-quota'");
    expect(sql).toContain("select pg_catalog.count(*) >= 250");
    expect(sql).toContain("select pg_catalog.count(*) >= 500");
    expect(sql).toContain("upload.created_at > pg_catalog.now() - interval '1 hour'");
    expect(sql).toContain("when new.intent_request_id is not null then 'upload_intent_created'");
    expect(sql).toContain("when new.intent_request_id is not null then 'upload-intent oprettet: '");
    expect(sql).toContain("not private.can_contribute_project(p_project_id)");
    expect(sql).toContain("intent_expires_at");
    expect(sql).toContain("revoke all on function public.create_upload_intent");
    expect(sql).toContain("to authenticated");
  });

  it("replaces the same-user prefix fallback with one exact live intent", () => {
    expect(sql).toContain("create or replace function private.can_write_monitoring_object");
    expect(sql).toContain("select pg_catalog.count(*) = 1 from public.uploads upload");
    expect(sql).toContain("upload.storage_path = _object_name");
    expect(sql).toContain("upload.uploaded_by = auth.uid()");
    expect(sql).toContain("upload.status = 'draft'");
    expect(sql).toContain("upload.intent_expires_at > pg_catalog.now()");
    expect(sql).toContain("and private.can_write_monitoring_object(name)");
    expect(sql).not.toContain("split_part(_object_name, '/', 1) = auth.uid()::text and not exists");
    expect(sql).not.toContain("create policy monitoring_uploads_update");
  });

  it("hides draft and archived bytes and locks the issued tenant scope", () => {
    expect(sql).toContain("create or replace function private.can_read_monitoring_object");
    expect(sql).toContain("upload.status = 'draft' and upload.intent_request_id is not null");
    expect(sql).toContain("upload.intent_expires_at > pg_catalog.now()");
    expect(sql).toContain("private.can_contribute_project(upload.project_id)");
    expect(sql).toContain("upload.intent_request_id is null");
    expect(sql).toContain("upload.received_at is not null");
    expect(sql).toContain("upload.status not in ('draft', 'archived')");
    expect(sql).not.toContain("split_part(_object_name, '/', 1) = auth.uid()::text and not exists");
    expect(sql).toContain("create or replace function private.reject_upload_intent_scope_change");
    expect(sql).toContain("new.zone_id is distinct from old.zone_id");
    expect(sql).toContain("upload_intent_scope_immutable");
    expect(sql).toContain(
      "foreign key (zone_id) references public.monitoring_zones(id) on delete restrict",
    );
  });

  it("only finalizes an owned object after matching size and MIME checks", () => {
    expect(sql).toContain("create or replace function public.finalize_upload_intent");
    expect(sql).toContain("object.owner_id, object.metadata");
    expect(sql).toContain("object_size_text::bigint <> intent.file_size");
    expect(sql).toContain("object_mime_type <> pg_catalog.lower(intent.mime_type)");
    expect(sql).toContain("set status = 'awaiting_validation'");
    expect(sql).toContain(
      "received_at = pg_catalog.coalesce(upload.received_at, pg_catalog.now())",
    );
    expect(sql).toContain("if intent.received_at is not null then");
    expect(sql).toContain(
      "existing_intent.status <> 'draft' and existing_intent.received_at is null",
    );
    expect(sql).toContain("create or replace function public.cancel_upload_intent");
    expect(sql).toContain("set status = 'archived'");
  });
});
