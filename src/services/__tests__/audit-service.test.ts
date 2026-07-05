import { describe, it, expect } from "vitest";
import { auditEventsToCsv, auditEventIcon } from "../audit-service";
import type { AuditEvent } from "@/lib/supabase/types";

const ev: AuditEvent = {
  id: "e1",
  project_id: "p1",
  event_type: "data_update",
  title: "Måling registreret",
  description: "60% · manuel",
  actor: "Bruger",
  source: "manual",
  hash: null,
  entity_type: "indicator",
  entity_id: "ind1",
  created_at: "2026-01-01T10:00:00Z",
};

describe("auditEventsToCsv", () => {
  it("emits header + row and escapes quotes and commas", () => {
    const messy: AuditEvent = { ...ev, id: "e2", title: 'Han sagde "hej", derefter', description: "line\nbreak" };
    const csv = auditEventsToCsv([ev, messy]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("created_at,event_type,entity_type,entity_id,title,description,actor,source");
    expect(lines).toHaveLength(4); // header + row1 + row2 (2 lines because of embedded newline quoted → still one CSV row containing \n)
    expect(csv).toContain('"Han sagde ""hej"", derefter"');
    expect(csv).toContain('"line\nbreak"');
  });

  it("handles null fields as empty", () => {
    const bare: AuditEvent = {
      ...ev,
      event_type: null,
      description: null,
      actor: null,
      source: null,
      entity_type: null,
      entity_id: null,
    };
    const csv = auditEventsToCsv([bare]);
    expect(csv.split("\n")[1]).toBe("2026-01-01T10:00:00Z,,,,Måling registreret,,,");
  });
});

describe("auditEventIcon", () => {
  it("maps known types", () => {
    expect(auditEventIcon("verification")).toBe("ShieldCheck");
    expect(auditEventIcon("data_update")).toBe("RefreshCw");
    expect(auditEventIcon("observation")).toBe("Eye");
    expect(auditEventIcon("report")).toBe("FileText");
    expect(auditEventIcon("risk")).toBe("AlertTriangle");
  });
  it("falls back to Activity", () => {
    expect(auditEventIcon("unknown_type")).toBe("Activity");
    expect(auditEventIcon(null)).toBe("Activity");
  });
});
