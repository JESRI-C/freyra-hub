import { describe, expect, it } from "vitest";
import { workOrderUsageConflict } from "../work-order-usage-conflict";
describe("usage write conflict guidance", () => {
  it("asks for a new version instead of claiming the job is cancelled", () => {
    expect(workOrderUsageConflict({ code: "PT409", details: "freyra.version_conflict" })).toBe(
      "changed",
    );
    expect(workOrderUsageConflict({ code: "PT409", details: null })).toBe("cancelled");
  });
  it("retains legacy version and duplicate-key recovery guidance", () => {
    expect(workOrderUsageConflict({ code: "40001" })).toBe("changed");
    expect(workOrderUsageConflict({ code: "23505" })).toBe("changed");
  });
  it("does not mistake permission failures or unrelated domain conflicts for cancellation", () => {
    expect(workOrderUsageConflict({ code: "42501" })).toBeUndefined();
    expect(
      workOrderUsageConflict({ code: "PT409", details: "freyra.lease_conflict" }),
    ).toBeUndefined();
    expect(workOrderUsageConflict(null)).toBeUndefined();
  });
});
