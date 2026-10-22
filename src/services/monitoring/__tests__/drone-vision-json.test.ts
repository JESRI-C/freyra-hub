import { describe, expect, it } from "vitest";
import { parseDroneVisionJson } from "../drone-vision-json";

describe("bounded lossless model JSON repair", () => {
  it("preserves a valid response", () => {
    expect(parseDroneVisionJson('{"a":"value"}')).toEqual({
      value: { a: "value" },
      repaired: false,
    });
  });
  it("repairs a complete markdown fence and trailing commas without changing quoted text", () => {
    expect(parseDroneVisionJson('\uFEFF```json\n{"a":["a,}","quote\\"",],}\n```')).toEqual({
      value: { a: ["a,}", 'quote"'] },
      repaired: true,
    });
  });
  it.each(['{"a":', 'Prose {"a":1}', "{'a':1}", '{"a":undefined}', '```json\n{"a":1}\n``` more'])(
    "never invents missing values or interprets code: %s",
    (text) => {
      expect(() => parseDroneVisionJson(text)).toThrow();
    },
  );
  it("enforces the content bound", () => {
    expect(() => parseDroneVisionJson(" ".repeat(16_001))).toThrow();
  });
});
