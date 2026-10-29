import { describe, expect, it } from "vitest";
import {
  FIELD_JOB_STARTER_TEMPLATES,
  FieldJobTemplateDefinitionSchema,
  FieldJobTemplateVersionSchema,
  FieldJobValuesSchema,
  FieldJobVersionSchema,
  fieldJobGaps,
  validateFieldJobValues,
  type FieldJobTemplateDefinition,
} from "../field-job-cards";

const definition = (): FieldJobTemplateDefinition => ({
  schema: "freyra.field-job-template/v1",
  title: "Feltbesøg",
  domain: "general",
  fields: [
    { key: "method", label: "Metode", type: "textarea", required: true },
    { key: "count", label: "Antal", type: "number", required: true },
    { key: "observed", label: "Observeret", type: "boolean", required: true },
    { key: "date", label: "Dato", type: "date", required: true },
    {
      key: "category",
      label: "Type",
      type: "select",
      required: false,
      options: ["Besøg", "Opfølgning"],
    },
  ],
});
const identity = {
  id: "00000000-0000-4000-8000-000000000001",
  organization_id: "00000000-0000-4000-8000-000000000002",
  project_id: "00000000-0000-4000-8000-000000000003",
  version: 1,
  request_id: "00000000-0000-4000-8000-000000000004",
  created_by: "00000000-0000-4000-8000-000000000005",
  created_at: "2026-10-29T10:00:00+01:00",
};

describe("field job template definitions", () => {
  it("trims labels and options while rejecting unrecognised definition fields", () => {
    const input = definition();
    input.title = " Feltbesøg ";
    input.fields[0].label = " Metode ";
    input.fields[4].options = [" Besøg ", " Opfølgning "];
    const parsed = FieldJobTemplateDefinitionSchema.parse(input);
    expect(parsed.title).toBe("Feltbesøg");
    expect(parsed.fields[0].label).toBe("Metode");
    expect(parsed.fields[4].options).toEqual(["Besøg", "Opfølgning"]);
    expect(FieldJobTemplateDefinitionSchema.safeParse({ ...input, ai_score: 0.9 }).success).toBe(
      false,
    );
    expect(
      FieldJobTemplateDefinitionSchema.safeParse({
        ...input,
        fields: [{ ...input.fields[0], score: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate field identities and invalid keys", () => {
    const input = definition();
    input.fields[1].key = "method";
    expect(FieldJobTemplateDefinitionSchema.safeParse(input).success).toBe(false);
    for (const key of ["Count", "two words", "1st", "", "a".repeat(49)])
      expect(
        FieldJobTemplateDefinitionSchema.safeParse({
          ...definition(),
          fields: [{ ...definition().fields[0], key }],
        }).success,
      ).toBe(false);
  });

  it("requires unique nonempty select options and forbids options on other types", () => {
    const input = definition();
    for (const options of [
      undefined,
      [],
      [""],
      ["Besøg", " Besøg "],
      Array.from({ length: 31 }, (_, index) => String(index)),
    ])
      expect(
        FieldJobTemplateDefinitionSchema.safeParse({
          ...input,
          fields: [{ ...input.fields[4], options }],
        }).success,
      ).toBe(false);
    expect(
      FieldJobTemplateDefinitionSchema.safeParse({
        ...input,
        fields: [{ ...input.fields[0], options: ["Besøg"] }],
      }).success,
    ).toBe(false);
  });

  it("bounds template size and field metadata", () => {
    const input = definition();
    const fields = Array.from({ length: 41 }, (_, index) => ({
      ...input.fields[0],
      key: `field_${index}`,
    }));
    expect(FieldJobTemplateDefinitionSchema.safeParse({ ...input, fields: [] }).success).toBe(
      false,
    );
    expect(FieldJobTemplateDefinitionSchema.safeParse({ ...input, fields }).success).toBe(false);
    for (const patch of [{ title: " " }, { title: "x".repeat(161) }, { domain: "unknown" }])
      expect(FieldJobTemplateDefinitionSchema.safeParse({ ...input, ...patch }).success).toBe(
        false,
      );
    for (const patch of [
      { label: " " },
      { helpText: "x".repeat(501) },
      { unit: "x".repeat(41) },
      { required: "yes" },
    ])
      expect(
        FieldJobTemplateDefinitionSchema.safeParse({
          ...input,
          fields: [{ ...input.fields[0], ...patch }],
        }).success,
      ).toBe(false);
  });
});

describe("field job values and completion", () => {
  it("accepts incomplete drafts and reports gaps without assigning a score", () => {
    expect(validateFieldJobValues(definition(), {})).toEqual({});
    expect(fieldJobGaps(definition(), {})).toEqual([
      "Udfyld Metode.",
      "Udfyld Antal.",
      "Udfyld Observeret.",
      "Udfyld Dato.",
    ]);
    expect(
      fieldJobGaps(definition(), { method: " ", count: null, observed: null, date: "" }),
    ).toHaveLength(4);
  });

  it("preserves 0 and false as completed answers and normalises whitespace", () => {
    const input = {
      method: "  Optælling  ",
      count: 0,
      observed: false,
      date: "2024-02-29",
      category: " Besøg ",
    };
    const parsed = validateFieldJobValues(definition(), input);
    expect(parsed).toEqual({ ...input, method: "Optælling", category: "Besøg" });
    expect(fieldJobGaps(definition(), parsed)).toEqual([]);
    expect(input.method).toBe("  Optælling  ");
  });

  it("accepts null for unknown answers but refuses unknown keys and nested data", () => {
    expect(validateFieldJobValues(definition(), { method: null, date: " ", category: "" })).toEqual(
      { method: null, date: null, category: null },
    );
    for (const values of [
      { unknown: "value" },
      { ai_score: 0.99 },
      { method: { text: "note" } },
      { method: ["note"] },
      { method: undefined },
    ])
      expect(() => validateFieldJobValues(definition(), values)).toThrow();
  });

  it("rejects type coercion and choices outside the selected template", () => {
    for (const values of [
      { count: "0" },
      { count: false },
      { observed: "false" },
      { observed: 0 },
      { method: 2 },
      { date: 20261029 },
      { category: true },
      { category: "Ukendt" },
    ])
      expect(() => validateFieldJobValues(definition(), values)).toThrow();
  });

  it("validates actual calendar days, including leap years", () => {
    expect(validateFieldJobValues(definition(), { date: "2024-02-29" }).date).toBe("2024-02-29");
    for (const date of [
      "2026-02-29",
      "2026-02-30",
      "2026-04-31",
      "2026-13-01",
      "2026-1-01",
      "29/10/2026",
      "2026-10-29T00:00:00Z",
    ])
      expect(() => validateFieldJobValues(definition(), { date })).toThrow();
  });

  it("rejects non-finite numbers and oversized strings", () => {
    for (const count of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(FieldJobValuesSchema.safeParse({ count }).success).toBe(false);
    expect(FieldJobValuesSchema.safeParse({ method: "x".repeat(4001) }).success).toBe(false);
  });
});

describe("version rows and starter templates", () => {
  it("reads version identities while stripping extra database metadata", () => {
    const row = FieldJobTemplateVersionSchema.parse({
      ...identity,
      template_id: identity.id,
      definition: definition(),
      internal_metadata: true,
    });
    expect(row.definition).toEqual(definition());
    expect(row).not.toHaveProperty("internal_metadata");
    const job = FieldJobVersionSchema.parse({
      ...identity,
      action_id: identity.id,
      template_version_id: identity.id,
      values: {},
      status: "draft",
      correction_reason: null,
    });
    expect(job.values).toEqual({});
    expect(job.correction_reason).toBeNull();
    expect(FieldJobVersionSchema.safeParse({ ...job, status: "approved" }).success).toBe(false);
    expect(FieldJobVersionSchema.safeParse({ ...job, version: 0 }).success).toBe(false);
    expect(FieldJobVersionSchema.safeParse({ ...job, request_id: "invalid" }).success).toBe(false);
  });

  it("provides four blank domain templates with stable shared field identities", () => {
    expect(FIELD_JOB_STARTER_TEMPLATES.map((template) => template.title)).toEqual([
      "Vandløbsbesøg",
      "Naturtilsyn",
      "Byggeri og natur",
      "Græsningspleje",
    ]);
    expect(new Set(FIELD_JOB_STARTER_TEMPLATES.map((template) => template.domain)).size).toBe(4);
    for (const template of FIELD_JOB_STARTER_TEMPLATES) {
      expect(FieldJobTemplateDefinitionSchema.safeParse(template).success).toBe(true);
      expect(template.fields.map((field) => field.key)).toEqual(
        expect.arrayContaining(["visit_date", "location", "method", "observations"]),
      );
      expect(validateFieldJobValues(template, {})).toEqual({});
      expect(fieldJobGaps(template, {}).length).toBeGreaterThan(0);
    }
  });
});
