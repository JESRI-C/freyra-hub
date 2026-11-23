import { describe, expect, it } from "vitest";
import { billedLineOre, billingDecimal, parseHourlyRateOre } from "../work-time-billing";

describe("approved time billing amounts", () => {
  it("accepts Danish and decimal point input, including explicit zero", () => {
    expect(parseHourlyRateOre(" 499,99 ")).toBe(49999);
    expect(parseHourlyRateOre("499.99")).toBe(49999);
    expect(parseHourlyRateOre("0")).toBe(0);
    for (const value of ["", "-1", "1,999", "1e3", "1000000", "1.000,00"])
      expect(parseHourlyRateOre(value)).toBeNull();
  });

  it("rounds each line to the nearest øre and formats a Danish decimal", () => {
    expect(billedLineOre(1, 29)).toBe(0);
    expect(billedLineOre(1, 30)).toBe(1);
    expect(billingDecimal(billedLineOre(75, 49999))).toBe("624,99");
  });
});
