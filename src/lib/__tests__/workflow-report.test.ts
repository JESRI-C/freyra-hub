import { describe, expect, it } from "vitest";
import { WorkflowReportSnapshotSchema } from "../workflow-report";
import { emptyExecution } from "../action-execution";
import { newReportContent, reportIssues, type ReportRevision } from "../report-document";
import { buildWorkflowReportPackage } from "../workflow-report-package";
const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(): ReportRevision {
  const entry = {
    id: uuid(1),
    entry_id: uuid(2),
    organization_id: uuid(3),
    project_id: uuid(4),
    version: 1,
    kind: "decision_note" as const,
    title: "SYNTHETIC execution",
    created_at: "2026-10-28T12:00:00Z",
    created_by: uuid(5),
    payload: {
      source: "action-execution:" + uuid(2),
      decision: JSON.stringify({
        ...emptyExecution(uuid(2)),
        dataBasis: "synthetic",
      }),
      basis: "SYNTHETIC",
    },
  };
  return {
    id: uuid(6),
    report_id: uuid(7),
    version: 1,
    status: "draft",
    created_at: "2026-10-28T12:00:00Z",
    created_by: uuid(5),
    content: {
      ...newReportContent("SYNTHETIC PROJECT", "SYNTHETIC ORG", "Descriptive", "Technical test"),
      sources: [
        {
          id: "media:" + uuid(8),
          title: "SYNTHETIC original",
          kind: "field_photo",
          capturedAt: null,
          checksum: "a".repeat(64),
          position: null,
          method: "Synthetic fixture",
          version: "1",
        },
      ],
      sections: [
        {
          id: "s1",
          title: "SYNTHETIC report",
          text: "Limited descriptive observation only.",
          sourceIds: ["media:" + uuid(8)],
          reviewed: true,
          basis: "not_measured",
        },
      ],
      workflowSnapshot: {
        schema: "freyra.workflow-report/v1",
        generatorVersion: "workflow-report/v1",
        projectId: uuid(4),
        organizationId: uuid(3),
        dataBasis: "synthetic",
        inputs: [entry],
        baselines: [],
        plans: [],
        rounds: [],
        limitations: ["Synthetic fixture only"],
        review: null,
      },
    },
  };
}
function files(bytes: Uint8Array) {
  const result: Record<string, Uint8Array> = {};
  let offset = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true),
      names = view.getUint16(offset + 26, true),
      extra = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + names));
    const start = offset + 30 + names + extra;
    result[name] = bytes.slice(start, start + size);
    offset = start + size;
  }
  return result;
}
describe("frozen workflow report", () => {
  it("refuses synthetic executions relabelled as customer observations", () => {
    const snapshot = fixture().content.workflowSnapshot!;
    expect(() => WorkflowReportSnapshotSchema.parse({ ...snapshot, dataBasis: "real" })).toThrow();
  });
  it("does not reuse review after the report result text changes", () => {
    const c = fixture().content;
    c.workflowSnapshot!.review = {
      scope: "documentation",
      decision: "accepted",
      inputIds: c.workflowSnapshot!.inputs.map((e) => e.id),
      reason: "SYNTHETIC review",
      sectionTexts: { s1: c.sections[0].text },
    };
    c.sections[0].text = "Changed result";
    expect(reportIssues(c).join(" ")).toContain("anden udgave");
  });
  it("exports real PDF/ZIP bytes, frozen inputs and verifiable file hashes deterministically", async () => {
    const report = fixture();
    const original = JSON.stringify(report);
    const bytes = await buildWorkflowReportPackage(report);
    const contents = files(bytes);
    expect(new TextDecoder().decode(contents["rapport.pdf"].slice(0, 5))).toBe("%PDF-");
    expect(JSON.parse(new TextDecoder().decode(contents["rapportversion.json"]))).toEqual(report);
    const manifest = JSON.parse(new TextDecoder().decode(contents["manifest.json"]));
    for (const file of manifest.files) {
      const data = contents[file.name];
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", data.slice().buffer)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      expect(file.sha256).toBe(hash);
      expect(file.bytes).toBe(data.length);
    }
    expect(await buildWorkflowReportPackage(JSON.parse(original))).toEqual(bytes);
    expect(JSON.stringify(report)).toBe(original);
  });
});
