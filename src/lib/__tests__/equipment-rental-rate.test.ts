import { describe, expect, it } from "vitest";
import {
  equipmentDailyPriceInput,
  formatEquipmentDailyPrice,
  parseEquipmentDailyPrice,
} from "../equipment-rental-rate";
describe("equipment catalogue price entry", () => {
  it.each([
    ["125,50", 12550],
    ["125.5", 12550],
    ["0", 0],
    [" 0,01 ", 1],
    ["9999999,99", 999999999],
  ])("parses %s exactly as minor units", (text, minor) =>
    expect(parseEquipmentDailyPrice(text)).toBe(minor),
  );
  it.each(["", "-1", "1.234,56", "1,234", "1e3", "Infinity", "10000000", "12 kr", ".50"])(
    "rejects ambiguous or unsupported input %s",
    (text) => expect(parseEquipmentDailyPrice(text)).toBeUndefined(),
  );
  it("preserves cents through editing and distinguishes a missing rate from zero", () => {
    expect(equipmentDailyPriceInput(12505)).toBe("125,05");
    expect(parseEquipmentDailyPrice(equipmentDailyPriceInput(12505))).toBe(12505);
    expect(formatEquipmentDailyPrice(null)).toBe("Ingen dagspris angivet");
    expect(formatEquipmentDailyPrice(0)).toContain("0,00");
  });
});
