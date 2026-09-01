// Evidence Service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";
import { fetchEvidenceFilesByProject, fetchAllEvidenceFiles } from "@/lib/supabase/queries";
import { SEED_EVIDENCE_FILES } from "@/data/platform-seed";
import type { EvidenceFile } from "@/lib/supabase/types";

interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}
interface UntypedDb {
  from(table: string): UntypedQueryBuilder;
}
function getDb(): UntypedDb | null {
  return supabase as unknown as UntypedDb | null;
}

const EVIDENCE_BUCKET = "evidence-files";

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
