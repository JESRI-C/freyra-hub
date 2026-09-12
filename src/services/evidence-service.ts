// Evidence Service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { fetchEvidenceFilesByProject, fetchAllEvidenceFiles } from "@/lib/supabase/queries";
import { SEED_EVIDENCE_FILES } from "@/data/platform-seed";
import type { EvidenceFile } from "@/lib/supabase/types";

interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  eq(column: string, value: unknown): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}
interface UntypedDb {
  from(table: string): UntypedQueryBuilder;
}
function getDb(): UntypedDb | null {
  return supabase as unknown as UntypedDb | null;
}

const EVIDENCE_BUCKET = "evidence-files";
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface EvidenceServiceResult<T> {
  data: T | null;
  error: string | null;
}

function getAuthorizedEvidencePath(row: Record<string, unknown>): string | null {
  const projectId = typeof row["project_id"] === "string" ? row["project_id"] : "";
  const filePath = typeof row["file_url"] === "string" ? row["file_url"].trim() : "";

  if (
    !POSTGRES_UUID.test(projectId) ||
    !filePath ||
    filePath.length > 1024 ||
    filePath.startsWith("/") ||
    filePath.startsWith("//") ||
    filePath.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(filePath)
  ) {
    return null;
  }

  const segments = filePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;

  const hasLegacyProjectScope = segments.length >= 2 && segments[0] === projectId;
  const hasCanonicalProjectScope =
    segments.length >= 6 &&
    segments[0] === "organizations" &&
    POSTGRES_UUID.test(segments[1] ?? "") &&
    segments[2] === "projects" &&
    segments[3] === projectId;

  return hasLegacyProjectScope || hasCanonicalProjectScope ? filePath : null;
}

/** UI affordance only; authorization is repeated against the RLS row on download. */
export function isEvidenceDownloadAvailable(
  file: Pick<EvidenceFile, "id" | "project_id" | "file_url">,
): boolean {
  return (
    isSupabaseConfigured &&
    POSTGRES_UUID.test(file.id) &&
    getAuthorizedEvidencePath({ project_id: file.project_id, file_url: file.file_url }) !== null
  );
}

export function sanitizeEvidenceFileName(fileName: string): string {
  const leafName = fileName.split(/[\\/]/).at(-1) ?? "";
  const sanitized = leafName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^\.+/, "")
    .replace(/_+/g, "_")
    .slice(0, 180);

  return sanitized || "evidence-file";
}

async function removeEvidenceObject(path: string): Promise<string | null> {
  if (!supabase) return "Supabase ikke konfigureret";

  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
  return error?.message ?? null;
}

export async function getEvidenceFilesByProject(projectId: string): Promise<EvidenceFile[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_EVIDENCE_FILES]
      .filter((e) => e.project_id === projectId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return fetchEvidenceFilesByProject(projectId);
}

export async function getAllEvidenceFiles(): Promise<EvidenceFile[]> {
  if (!isSupabaseConfigured) {
    return [...SEED_EVIDENCE_FILES].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return fetchAllEvidenceFiles();
}

/**
 * Create a short-lived download URL only after the current user's RLS-scoped
 * row lookup proves that the evidence belongs to the requested project. The
 * private Storage path always comes from that row, never from caller input.
 */
export async function getEvidenceDownloadUrl(input: {
  evidenceId: string;
  projectId: string;
}): Promise<EvidenceServiceResult<string>> {
  if (!POSTGRES_UUID.test(input.evidenceId) || !POSTGRES_UUID.test(input.projectId)) {
    return { data: null, error: "Ugyldig dokumentationsreference." };
  }
  if (!isSupabaseConfigured || !supabase) {
    return { data: null, error: "Sikker download kræver en konfigureret database." };
  }

  const db = getDb();
  if (!db) return { data: null, error: "Sikker download er ikke tilgængelig." };

  const { data: row, error: readError } = await db
    .from("evidence_files")
    .select("id,project_id,file_url")
    .eq("id", input.evidenceId)
    .eq("project_id", input.projectId)
    .single();

  if (
    readError ||
    !row ||
    row["id"] !== input.evidenceId ||
    row["project_id"] !== input.projectId
  ) {
    return {
      data: null,
      error: "Dokumentationen blev ikke fundet, eller du har ikke adgang til den.",
    };
  }

  const filePath = getAuthorizedEvidencePath(row);
  if (!filePath) {
    return {
      data: null,
      error: "Dokumentationen har en ugyldig eller forkert afgrænset Storage-sti.",
    };
  }

  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL_SECONDS, { download: true });

  if (error || !data?.signedUrl) {
    return { data: null, error: "Kunne ikke oprette et sikkert downloadlink." };
  }

  return { data: data.signedUrl, error: null };
}

export async function uploadEvidenceFile(input: {
  projectId: string;
  reportId?: string;
  title: string;
  evidenceType: string;
  file: File;
}): Promise<EvidenceFile | null> {
  if (!isSupabaseConfigured || !supabase) {
    // Simulate upload in preview mode — return a mock EvidenceFile
    const mock: EvidenceFile = {
      id: `ev-${Date.now()}`,
      project_id: input.projectId,
      report_id: input.reportId ?? null,
      title: input.title,
      evidence_type: input.evidenceType,
      file_type: input.file.type || null,
      file_url: `preview/${input.projectId}/${input.file.name}`,
      created_at: new Date().toISOString(),
    };
    return mock;
  }

  // Real Supabase Storage upload
  const safeName = sanitizeEvidenceFileName(input.file.name);
  const path = `${input.projectId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, input.file, {
      cacheControl: "300",
      contentType: input.file.type || undefined,
      upsert: false,
    });

  if (uploadError) {
    console.error("Evidence upload failed:", uploadError);
    return null;
  }

  const db = getDb();
  if (!db) {
    const cleanupError = await removeEvidenceObject(path);
    if (cleanupError) console.error("Evidence Storage cleanup failed:", cleanupError);
    return null;
  }

  const { data, error: insertError } = await db
    .from("evidence_files")
    .insert({
      project_id: input.projectId,
      report_id: input.reportId ?? null,
      title: input.title,
      evidence_type: input.evidenceType,
      file_type: input.file.type || null,
      // `file_url` stores the private object path. A signed URL must only be
      // created on an authorized read when a UI actually needs to download it.
      file_url: path,
    })
    .select()
    .single();

  if (insertError || !data) {
    console.error(
      "Evidence DB insert failed:",
      insertError ?? { message: "Databasen returnerede ikke den oprettede evidensrække" },
    );
    const cleanupError = await removeEvidenceObject(path);
    if (cleanupError) console.error("Evidence Storage cleanup failed:", cleanupError);
    return null;
  }

  return data as unknown as EvidenceFile;
}

export function evidenceTypeLabelDa(type: string): string {
  switch (type) {
    case "feltrapport":
      return "Feltrapport";
    case "certifikat":
      return "Certifikat";
    case "satellitbillede":
      return "Satellitbillede";
    case "baselinestudie":
      return "Baselinestudie";
    case "kortlægning":
      return "Kortlægning";
    case "foto":
      return "Foto";
    case "kontrakt":
      return "Kontrakt";
    case "metodebeskrivelse":
      return "Metodebeskrivelse";
    default:
      return type;
  }
}
