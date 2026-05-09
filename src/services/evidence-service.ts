// Evidence Service

import { isSupabaseConfigured } from "@/lib/supabase/client";
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

// Scaffold only — Supabase Storage upload not implemented in seed mode
export async function uploadEvidenceFile(input: {
  projectId: string;
  reportId?: string;
  title: string;
  evidenceType: string;
  file: File;
}): Promise<EvidenceFile | null> {
  if (!isSupabaseConfigured) {
    console.warn("uploadEvidenceFile: Supabase Storage is not configured. Upload skipped.");
    return null;
  }
  // TODO: implement Supabase Storage upload when storage is configured
  console.warn("uploadEvidenceFile: not yet implemented for Supabase Storage.");
  return null;
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
