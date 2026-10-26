import { z } from "zod";

const text = z.string().max(2000);
const nullable = text.nullable().optional();
const project = z.object({ id: z.string(), name: text, description: nullable });
const indicator = z.object({
  id: z.string(),
  key: text,
  label: text,
  value: z.number().finite().nullable(),
  unit: nullable,
  updated_at: nullable,
});
const action = z.object({
  id: z.string(),
  title: text,
  status: nullable,
  priority: nullable,
  due_date: nullable,
});
const risk = z.object({
  id: z.string(),
  title: text,
  severity: nullable,
  likelihood: nullable,
  status: nullable,
});
const source = z.object({ id: z.string(), name: text, status: nullable, last_sync_at: nullable });
const Evidence = z.object({
  project,
  indicators: z.array(indicator).max(100),
  actions: z.array(action).max(100),
  environmental_risks: z.array(risk).max(100),
  data_sources: z.array(source).max(100),
});

/** Only these approved fields may cross the AI boundary. Unknown fields are stripped. */
export function projectAssistantPayload(
  question: string,
  records: unknown,
  credentials: readonly string[],
) {
  const evidence = Evidence.parse(records);
  const sourceIds = new Set([`projects:${evidence.project.id}`]);
  for (const table of ["indicators", "actions", "environmental_risks", "data_sources"] as const)
    for (const row of evidence[table]) sourceIds.add(`${table}:${row.id}`);
  const payload = {
    question: z.string().trim().min(1).max(2000).parse(question),
    records: evidence,
    availableSourceIds: [...sourceIds],
    limitations:
      "Højst 100 registreringer pr. kilde. Ingen billeder fortolkes. Registreringer er ikke faglig godkendelse.",
  };
  const json = JSON.stringify(payload);
  // Auth is verified internally. No token, password or API key belongs in model input,
  // including one accidentally pasted into a question or a project description.
  if (
    credentials.some((value) => value.length > 8 && json.includes(value)) ||
    /(?:Bearer\s+[\w.-]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+|(?:password|adgangskode|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)\s*[:=]\s*[^\s"\\]{3,})/i.test(
      json,
    )
  )
    throw new Error("credential_in_evidence");
  if (new TextEncoder().encode(json).length > 60000) throw new Error("evidence_too_large");
  return { json, sourceIds };
}
