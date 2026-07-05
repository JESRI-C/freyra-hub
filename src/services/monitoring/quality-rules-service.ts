// Data-quality rules and issues service.
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logAuditEvent } from "./audit-service";

export type QualityRule = Database["public"]["Tables"]["data_quality_rules"]["Row"];
export type QualityRuleInsert = Database["public"]["Tables"]["data_quality_rules"]["Insert"];
export type QualityIssue = Database["public"]["Tables"]["data_quality_issues"]["Row"];
export type QualityIssueInsert = Database["public"]["Tables"]["data_quality_issues"]["Insert"];

export type RuleType =
  | "missing_value"
  | "out_of_range"
  | "duplicate"
  | "invalid_date"
  | "missing_gps"
  | "outside_project"
  | "stale_data"
  | "identical_repeat"
  | "spike"
  | "unit_mismatch";

export const RULE_TYPES: { value: RuleType; label: string }[] = [
  { value: "missing_value", label: "Manglende værdier" },
  { value: "out_of_range", label: "Værdier uden for interval" },
  { value: "duplicate", label: "Dubletter" },
  { value: "invalid_date", label: "Ugyldig dato" },
  { value: "missing_gps", label: "Mangler GPS" },
  { value: "outside_project", label: "Uden for projektområde" },
  { value: "stale_data", label: "For gammel data" },
  { value: "identical_repeat", label: "Gentagne identiske værdier" },
  { value: "spike", label: "Unormale spring" },
  { value: "unit_mismatch", label: "Enhedsuoverensstemmelse" },
];

export async function listRules(projectId: string | null): Promise<QualityRule[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("data_quality_rules").select("*").order("created_at", { ascending: false });
  if (projectId) q = q.or(`project_id.eq.${projectId},project_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return (data as QualityRule[] | null) ?? [];
}

export async function createRule(input: QualityRuleInsert): Promise<QualityRule> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: raw, error } = await supabase.from("data_quality_rules").insert(input as never).select("*").single();
  const data = raw as unknown as QualityRule;
  if (error) throw error;
  await logAuditEvent({
    projectId: data.project_id,
    eventType: "quality_rule_created",
    entityType: "data_quality_rule",
    entityId: data.id,
    title: `Kvalitetsregel oprettet: ${data.name}`,
    afterData: { id: data.id, rule_type: data.rule_type, severity: data.severity },
  });
  return data as QualityRule;
}

export async function toggleRule(id: string, isActive: boolean): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("data_quality_rules").update({ is_active: isActive } as never).eq("id", id);
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { error } = await supabase.from("data_quality_rules").delete().eq("id", id);
  if (error) throw error;
}

export async function listIssues(params: {
  projectId: string;
  status?: string;
  severity?: string;
  limit?: number;
}): Promise<QualityIssue[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  let q = supabase.from("data_quality_issues").select("*").eq("project_id", params.projectId).order("created_at", { ascending: false });
  if (params.status) q = q.eq("status", params.status);
  if (params.severity) q = q.eq("severity", params.severity);
  q = q.limit(params.limit ?? 100);
  const { data, error } = await q;
  if (error) throw error;
  return (data as QualityIssue[] | null) ?? [];
}

export async function createIssue(input: QualityIssueInsert): Promise<QualityIssue> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: raw, error } = await supabase.from("data_quality_issues").insert(input as never).select("*").single();
  const data = raw as unknown as QualityIssue;
  if (error) throw error;
  await logAuditEvent({
    projectId: data.project_id,
    eventType: "quality_issue_created",
    entityType: "data_quality_issue",
    entityId: data.id,
    title: `Datakvalitetsproblem: ${data.issue_type}`,
    description: data.description ?? undefined,
    afterData: { id: data.id, issue_type: data.issue_type, severity: data.severity },
  });
  return data as QualityIssue;
}

export async function updateIssue(id: string, patch: Partial<QualityIssue>, reason?: string): Promise<QualityIssue> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: current } = await supabase.from("data_quality_issues").select("*").eq("id", id).maybeSingle();
  const { data: raw, error } = await supabase.from("data_quality_issues").update(patch as never).eq("id", id).select("*").single();
  const data = raw as unknown as QualityIssue;
  if (error) throw error;
  await logAuditEvent({
    projectId: data.project_id,
    eventType: "quality_issue_updated",
    entityType: "data_quality_issue",
    entityId: id,
    title: `Datakvalitetsproblem opdateret`,
    description: reason,
    beforeData: current as Record<string, unknown> | null,
    afterData: data as Record<string, unknown>,
  });
  return data as QualityIssue;
}

export async function resolveIssue(id: string, resolution: { status: "resolved" | "rejected" | "excluded"; note?: string; correctedData?: Record<string, unknown> | null }): Promise<QualityIssue> {
  if (!isSupabaseConfigured || !supabase) throw new Error("Supabase not configured");
  const { data: auth } = await supabase.auth.getUser();
  return updateIssue(
    id,
    {
      status: resolution.status,
      resolution_note: resolution.note ?? null,
      corrected_data: (resolution.correctedData ?? null) as never,
      resolved_by: auth.user?.id ?? null,
      resolved_at: new Date().toISOString(),
    },
    resolution.note,
  );
}

export interface IssueSummary {
  open: number;
  resolved: number;
  rejected: number;
  excluded: number;
  bySeverity: Record<string, number>;
}

export function summarizeIssues(issues: QualityIssue[]): IssueSummary {
  const summary: IssueSummary = { open: 0, resolved: 0, rejected: 0, excluded: 0, bySeverity: {} };
  for (const issue of issues) {
    if (issue.status === "open") summary.open++;
    else if (issue.status === "resolved") summary.resolved++;
    else if (issue.status === "rejected") summary.rejected++;
    else if (issue.status === "excluded") summary.excluded++;
    summary.bySeverity[issue.severity] = (summary.bySeverity[issue.severity] ?? 0) + 1;
  }
  return summary;
}
