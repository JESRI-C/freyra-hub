// Evidence Service

import { isSupabaseConfigured, supabase } from "@/lib/supabase/client";

interface UntypedQueryBuilder {
  insert(values: Record<string, unknown>): UntypedQueryBuilder;
  select(columns?: string): UntypedQueryBuilder;
  single(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
}
interface UntypedDb { from(table: string): UntypedQueryBuilder; }
function getDb(): UntypedDb | null { return supabase as unknown as UntypedDb | null; }
import { fetchEvidenceFilesByProject, fetchAllEvidenceFiles } from "@/lib/supabase/queries";
import { SEED_EVIDENCE_FILES } from "@/data/platform-seed";
import type { EvidenceFile } from "@/lib/supabase/types";

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
  const path = `${input.projectId}/${Date.now()}_${input.file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("evidence-files")
    .upload(path, input.file);

  if (uploadError) {
    console.error("Evidence upload failed:", uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage.from("evidence-files").getPublicUrl(path);

  const db = getDb();
  if (!db) return null;

  const { data, error: insertError } = await db
    .from("evidence_files")
    .insert({
      project_id: input.projectId,
      report_id: input.reportId ?? null,
      title: input.title,
      evidence_type: input.evidenceType,
      file_type: input.file.type || null,
      file_url: urlData.publicUrl,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Evidence DB insert failed:", insertError);
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
