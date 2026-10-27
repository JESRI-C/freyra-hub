import { describe, expect, it } from "vitest";
import { newReportContent, ReportContentSchema, validateReportRevision } from "../report-document";
import { REPORT_TEMPLATES } from "../report-templates";

describe("shared report templates and evidence approval", () => {
  it.each(REPORT_TEMPLATES)(
    "$id survives serialization but requires real evidence before approval",
    (template) => {
      const draft = newReportContent(
        "Valgt projekt",
        "Valgt organisation",
        template.scope,
        "Kommune eller privat kunde",
        template.id,
      );
      const restored = ReportContentSchema.parse(JSON.parse(JSON.stringify(draft)));
      expect(restored.templateId).toBe(template.id);
      expect(restored.projectName).toBe("Valgt projekt");
      expect(restored.sources).toEqual([]);
      expect(
        restored.sections.every((section) => !section.reviewed && section.basis === "not_measured"),
      ).toBe(true);
      expect(() => validateReportRevision(restored, "draft")).not.toThrow();
      expect(() => validateReportRevision(restored, "approved")).toThrow();
    },
  );
  it("retains historical report content without imposing a new template", () => {
    const old = newReportContent("P", "O", "S", "Kunde");
    delete old.templateId;
    old.title = "Tidligere godkendt formulering";
    const restored = ReportContentSchema.parse(JSON.parse(JSON.stringify(old)));
    expect(restored).toEqual(old);
  });
  it("rejects a forged template identifier in persisted report content", () => {
    const draft = newReportContent("P", "O", "S", "Kunde");
    expect(() => ReportContentSchema.parse({ ...draft, templateId: "another-provider" })).toThrow();
  });
});
