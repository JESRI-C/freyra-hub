import { describe, expect, it } from "vitest";
import {
  nextBatchSequence,
  runWithConcurrency,
  selectUniqueBatchFiles,
} from "../drone-before-batch-helpers";

const file = (name: string, size = 10) => ({
  name,
  size,
  lastModified: 1,
  type: "image/jpeg",
});

describe("selectUniqueBatchFiles", () => {
  it("deduplikerer og håndhæver batchgrænsen", () => {
    const result = selectUniqueBatchFiles({
      existing: [file("a.jpg")],
      incoming: [file("a.jpg"), file("b.jpg"), file("c.jpg")],
      limit: 2,
    });

    expect(result.accepted.map((entry) => entry.name)).toEqual(["b.jpg"]);
    expect(result.duplicateCount).toBe(1);
    expect(result.capacityRejectedCount).toBe(1);
  });

  it("bevarer alle 120 forskellige billeder i den bestilte FØR-runde", () => {
    const incoming = Array.from({ length: 120 }, (_, index) =>
      file(`DJI_${String(index + 1).padStart(4, "0")}.JPG`, 8_000_000 + index),
    );

    const result = selectUniqueBatchFiles({ existing: [], incoming });

    expect(result.accepted).toHaveLength(120);
    expect(result.accepted[0]?.name).toBe("DJI_0001.JPG");
    expect(result.accepted[119]?.name).toBe("DJI_0120.JPG");
    expect(result.duplicateCount).toBe(0);
    expect(result.capacityRejectedCount).toBe(0);
  });
});

describe("runWithConcurrency", () => {
  it("kører aldrig flere jobs end den aftalte samtidighed", async () => {
    let active = 0;
    let maximum = 0;
    const completed: number[] = [];

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      completed.push(value);
      active -= 1;
    });

    expect(maximum).toBe(2);
    expect(completed.sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("nextBatchSequence", () => {
  it("remains monotonic when an item in the middle of a batch is removed", () => {
    expect(nextBatchSequence([1, 3])).toBe(4);
    expect(nextBatchSequence([])).toBe(1);
  });
});
