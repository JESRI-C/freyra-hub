import { z } from "zod";
import { CalendarDate } from "./action-execution";

const optionSchema = z.string().trim().min(1).max(120);

export const FieldJobFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    label: z.string().trim().min(1).max(120),
    type: z.enum(["text", "textarea", "number", "date", "boolean", "select"]),
    required: z.boolean(),
    helpText: z.string().trim().max(500).optional(),
    unit: z.string().trim().max(40).optional(),
    options: z.array(optionSchema).min(1).max(30).optional(),
  })
  .strict()
  .superRefine((field, ctx) => {
    if (field.type === "select" && !field.options)
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Valgfeltet kræver valgmuligheder.",
      });
    if (field.type !== "select" && field.options !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Kun valgfeltet har valgmuligheder.",
      });
    if (field.options && new Set(field.options).size !== field.options.length)
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Hver valgmulighed skal være unik.",
      });
  });

export const FieldJobTemplateDefinitionSchema = z
  .object({
    schema: z.literal("freyra.field-job-template/v1"),
    title: z.string().trim().min(1).max(160),
    domain: z.enum(["watercourse", "nature", "construction", "grazing", "general"]),
    fields: z.array(FieldJobFieldSchema).min(1).max(40),
  })
  .strict()
  .superRefine((definition, ctx) => {
    const keys = new Set<string>();
    definition.fields.forEach((field, index) => {
      if (keys.has(field.key))
        ctx.addIssue({
          code: "custom",
          path: ["fields", index, "key"],
          message: "Hvert felt skal have en unik nøgle.",
        });
      keys.add(field.key);
    });
  });

export const FieldJobValuesSchema = z.record(
  z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
  z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()]),
);

export type FieldJobField = z.infer<typeof FieldJobFieldSchema>;
export type FieldJobTemplateDefinition = z.infer<typeof FieldJobTemplateDefinitionSchema>;
export type FieldJobValues = z.infer<typeof FieldJobValuesSchema>;

/** Missing required answers are allowed in drafts; incorrect answers never are. */
export function validateFieldJobValues(
  definition: FieldJobTemplateDefinition,
  values: unknown,
): FieldJobValues {
  const template = FieldJobTemplateDefinitionSchema.parse(definition);
  const parsed = FieldJobValuesSchema.parse(values);
  const fields = new Map(template.fields.map((field) => [field.key, field]));
  const result: FieldJobValues = {};
  for (const [key, raw] of Object.entries(parsed)) {
    const field = fields.get(key);
    if (!field) throw new Error(`Ukendt jobkortfelt: ${key}.`);
    const value = typeof raw === "string" ? raw.trim() : raw;
    if (value === null) {
      result[key] = null;
      continue;
    }
    const invalid = () => new Error(`Ugyldig værdi for ${field.label}.`);
    switch (field.type) {
      case "text":
      case "textarea":
        if (typeof value !== "string") throw invalid();
        result[key] = value;
        break;
      case "number":
        if (typeof value !== "number") throw invalid();
        result[key] = value;
        break;
      case "boolean":
        if (typeof value !== "boolean") throw invalid();
        result[key] = value;
        break;
      case "date":
        if (typeof value !== "string" || (value !== "" && !CalendarDate.safeParse(value).success))
          throw invalid();
        result[key] = value || null;
        break;
      case "select":
        if (typeof value !== "string" || (value !== "" && !field.options!.includes(value)))
          throw invalid();
        result[key] = value || null;
        break;
    }
  }
  return result;
}

/** Completion gaps describe missing input, never a biological or AI confidence score. */
export function fieldJobGaps(
  definition: FieldJobTemplateDefinition,
  values: FieldJobValues,
): string[] {
  const parsed = validateFieldJobValues(definition, values);
  return definition.fields
    .filter((field) => {
      const value = parsed[field.key];
      return field.required && (value === undefined || value === null || value === "");
    })
    .map((field) => `Udfyld ${field.label}.`);
}

const identityShape = {
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  project_id: z.string().uuid(),
  version: z.number().int().positive(),
  request_id: z.string().uuid(),
  created_by: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
};

/** Database rows may carry additional metadata; the embedded definitions remain strict. */
export const FieldJobTemplateVersionSchema = z.object({
  ...identityShape,
  template_id: z.string().uuid(),
  definition: FieldJobTemplateDefinitionSchema,
});
export type FieldJobTemplateVersion = z.infer<typeof FieldJobTemplateVersionSchema>;

export const FieldJobVersionSchema = z.object({
  ...identityShape,
  action_id: z.string().uuid(),
  template_version_id: z.string().uuid(),
  values: FieldJobValuesSchema,
  status: z.enum(["draft", "recorded", "needs_review"]),
  correction_reason: z.string().trim().max(2000).nullable(),
});
export type FieldJobVersion = z.infer<typeof FieldJobVersionSchema>;

const commonFields: FieldJobField[] = [
  { key: "visit_date", label: "Dato for besøg", type: "date", required: true },
  { key: "location", label: "Sted eller delområde", type: "text", required: true },
  { key: "method", label: "Metode og undersøgelsens omfang", type: "textarea", required: true },
];

/** Blank form definitions only. These templates contain no field observations or approvals. */
export const FIELD_JOB_STARTER_TEMPLATES: FieldJobTemplateDefinition[] = [
  {
    schema: "freyra.field-job-template/v1",
    title: "Vandløbsbesøg",
    domain: "watercourse",
    fields: [
      ...commonFields,
      {
        key: "observations",
        label: "Observationer om vandløb og vegetation",
        type: "textarea",
        required: true,
      },
      {
        key: "water_level",
        label: "Målt vandstand",
        type: "number",
        required: false,
        unit: "cm",
        helpText: "Angiv kun en faktisk måling. Beskriv referencepunkt og målemetode nedenfor.",
      },
      {
        key: "measurement_reference",
        label: "Referencepunkt og målemetode",
        type: "textarea",
        required: false,
      },
      {
        key: "deviations",
        label: "Afvigelser og begrænsninger",
        type: "textarea",
        required: false,
      },
      { key: "follow_up", label: "Behov for opfølgning", type: "textarea", required: false },
    ],
  },
  {
    schema: "freyra.field-job-template/v1",
    title: "Naturtilsyn",
    domain: "nature",
    fields: [
      ...commonFields,
      {
        key: "observations",
        label: "Observationer om natur og levesteder",
        type: "textarea",
        required: true,
      },
      {
        key: "species_notes",
        label: "Artsnoter og usikkerheder",
        type: "textarea",
        required: false,
        helpText: "Skeln mellem artsforslag og fagligt verificerede fund.",
      },
      { key: "management_notes", label: "Plejebehov", type: "textarea", required: false },
      {
        key: "deviations",
        label: "Afvigelser og begrænsninger",
        type: "textarea",
        required: false,
      },
      { key: "follow_up", label: "Behov for opfølgning", type: "textarea", required: false },
    ],
  },
  {
    schema: "freyra.field-job-template/v1",
    title: "Byggeri og natur",
    domain: "construction",
    fields: [
      ...commonFields,
      {
        key: "work_description",
        label: "Arbejdet der føres tilsyn med",
        type: "textarea",
        required: true,
      },
      {
        key: "observations",
        label: "Observerede forhold og naturhensyn",
        type: "textarea",
        required: true,
      },
      {
        key: "requirements_reference",
        label: "Henvisning til relevante vilkår",
        type: "text",
        required: false,
      },
      {
        key: "deviations",
        label: "Afvigelser og begrænsninger",
        type: "textarea",
        required: false,
      },
      { key: "follow_up", label: "Behov for opfølgning", type: "textarea", required: false },
    ],
  },
  {
    schema: "freyra.field-job-template/v1",
    title: "Græsningspleje",
    domain: "grazing",
    fields: [
      ...commonFields,
      {
        key: "observations",
        label: "Observationer om dyr og areal",
        type: "textarea",
        required: true,
      },
      {
        key: "animal_count",
        label: "Observeret antal dyr",
        type: "number",
        required: false,
        unit: "dyr",
      },
      { key: "fence_notes", label: "Hegn og adgangsforhold", type: "textarea", required: false },
      { key: "water_notes", label: "Vandforsyning", type: "textarea", required: false },
      { key: "follow_up", label: "Behov for opfølgning", type: "textarea", required: false },
    ],
  },
].map((definition) => FieldJobTemplateDefinitionSchema.parse(definition));
