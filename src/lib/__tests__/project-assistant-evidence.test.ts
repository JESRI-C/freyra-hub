import { describe, expect, it } from "vitest";
import { projectAssistantPayload } from "../project-assistant-evidence";
const records = () => ({
  project: {
    id: "p",
    name: "Sag",
    description: "Registreret grundlag",
    accessToken: "not-an-approved-field",
  },
  indicators: [
    {
      id: "i",
      key: "water",
      label: "Måling",
      value: 0,
      unit: "m",
      updated_at: null,
      password: "not-an-approved-field",
    },
  ],
  actions: [],
  environmental_risks: [],
  data_sources: [],
  session: { access_token: "not-an-approved-field" },
});
describe("approved AI payload", () => {
  it("keeps zero and strips every field outside the approved project schema", () => {
    const result = projectAssistantPayload("Hvad er grundlaget?", records(), [
      "login-token-123456",
    ]);
    expect(JSON.parse(result.json).records.indicators[0].value).toBe(0);
    expect(result.sourceIds).toEqual(new Set(["projects:p", "indicators:i"]));
    expect(result.json).not.toContain("accessToken");
    expect(result.json).not.toContain("password");
    expect(result.json).not.toContain("session");
    expect(result.json).not.toContain("not-an-approved-field");
  });
  it("stops rather than forwarding a pasted login token", () => {
    expect(() =>
      projectAssistantPayload("Brug login-token-123456", records(), ["login-token-123456"]),
    ).toThrow("credential_in_evidence");
    expect(() => projectAssistantPayload("Bearer abcdefghijklmnopqrst", records(), [])).toThrow(
      "credential_in_evidence",
    );
  });
  it("also detects credentials pasted into an otherwise approved text field", () => {
    const r = records();
    r.project.description = "adgangskode: meget-hemmelig";
    expect(() => projectAssistantPayload("Opsummér", r, [])).toThrow("credential_in_evidence");
  });
  it("rejects an excessive payload instead of silently dropping project records", () => {
    const r = records();
    r.indicators = Array.from({ length: 100 }, (_, i) => ({
      ...r.indicators[0],
      id: String(i),
      label: "x".repeat(2000),
    }));
    expect(() => projectAssistantPayload("Opsummér", r, [])).toThrow("evidence_too_large");
  });
});
