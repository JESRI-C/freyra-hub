import { z } from "zod";

const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const version = z.number().int().min(0).max(2147483646);
export const CustomerFieldsSchema = z
  .object({
    name: text(240).min(1),
    registrationNumber: text(40),
    address: text(500),
    postalCode: text(30),
    city: text(160),
    country: text(80).min(1),
    archived: z.boolean(),
  })
  .strict();
export const CustomerContactFieldsSchema = z
  .object({
    name: text(240).min(1),
    title: text(160),
    email: text(254).refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
    phone: text(80),
    archived: z.boolean(),
  })
  .strict();
const scope = { organizationId: id, expectedActorId: id };
const write = { ...scope, requestId: id };
export const CustomerCommandSchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...write,
      operation: z.literal("save_customer"),
      customerId: id.nullable(),
      expectedVersion: version,
      data: CustomerFieldsSchema,
    })
    .strict(),
  z
    .object({
      ...write,
      operation: z.literal("save_contact"),
      customerId: id,
      contactId: id.nullable(),
      expectedVersion: version,
      data: CustomerContactFieldsSchema,
    })
    .strict(),
  z
    .object({
      ...write,
      operation: z.literal("grant_planner"),
      customerId: id,
      userId: id,
      expectedVersion: version,
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      ...write,
      operation: z.literal("create_case"),
      customerId: id,
      contactId: id.nullable(),
      title: text(240).min(1),
      description: text(4000),
      location: text(500),
      customerReference: text(240),
    })
    .strict(),
  z
    .object({
      ...write,
      operation: z.literal("bind_case"),
      projectId: id,
      customerId: id,
      contactId: id.nullable(),
      expectedVersion: version,
      customerReference: text(240),
    })
    .strict(),
  z
    .object({
      ...write,
      operation: z.literal("save_reference"),
      projectId: id,
      expectedVersion: version,
      customerReference: text(240),
    })
    .strict(),
]);
export const CustomerQuerySchema = z.discriminatedUnion("operation", [
  z
    .object({
      ...scope,
      operation: z.literal("list"),
      search: text(120),
      includeArchived: z.boolean(),
      offset: z.number().int().min(0).max(100000),
    })
    .strict(),
  z.object({ ...scope, operation: z.literal("customer"), customerId: id }).strict(),
  z
    .object({
      ...scope,
      operation: z.literal("cases"),
      customerId: id,
      offset: z.number().int().min(0).max(100000),
    })
    .strict(),
  z.object({ ...scope, operation: z.literal("case"), projectId: id }).strict(),
  z.object({ ...scope, operation: z.literal("job"), projectId: id, actionId: id }).strict(),
]);
const customer = z.object({
  id,
  number: text(40).min(1),
  version: version.min(1),
  data: CustomerFieldsSchema,
});
export const CustomerListSchema = z.object({
  organizationId: id,
  canManage: z.boolean(),
  rows: z.array(customer).max(50),
  hasMore: z.boolean(),
});
export const CustomerDetailSchema = z.object({
  organizationId: id,
  canManage: z.boolean(),
  customer,
  contacts: z
    .array(z.object({ id, version: version.min(1), data: CustomerContactFieldsSchema }))
    .max(500),
  history: z
    .array(z.object({ version: version.min(1), changedAt: z.string(), data: CustomerFieldsSchema }))
    .max(20),
  planners: z
    .array(z.object({ userId: id, enabled: z.boolean(), version: version.min(1) }))
    .max(500),
  availableUsers: z.array(z.object({ userId: id, name: text(500).min(1) })).max(500),
});
export const CustomerCaseListSchema = z.object({
  organizationId: id,
  customerId: id,
  rows: z
    .array(
      z.object({
        projectId: id,
        number: text(40).min(1),
        title: text(500).min(1),
        customerReference: text(240),
        version: version.min(1),
      }),
    )
    .max(50),
  hasMore: z.boolean(),
});
export const CaseCustomerContextSchema = z.object({
  organizationId: id,
  projectId: id,
  actionId: id.nullable(),
  canEdit: z.boolean(),
  binding: z
    .object({
      id,
      version: version.min(1),
      number: text(40).min(1),
      customerId: id,
      customerRevisionId: id,
      customerNumber: text(40).min(1),
      customerName: text(240).min(1),
      contactId: id.nullable(),
      contactRevisionId: id.nullable(),
      contact: CustomerContactFieldsSchema.nullable(),
      customerReference: text(240),
    })
    .nullable(),
});
export const CustomerCommandReceiptSchema = z.object({
  organizationId: id,
  requestId: id,
  actorId: id,
  operation: z.enum([
    "save_customer",
    "save_contact",
    "grant_planner",
    "create_case",
    "bind_case",
    "save_reference",
  ]),
  id,
  version: version.min(1),
  number: text(40).optional(),
});
export type CustomerCommand = z.infer<typeof CustomerCommandSchema>;
export type CustomerQuery = z.infer<typeof CustomerQuerySchema>;
export type CustomerFields = z.infer<typeof CustomerFieldsSchema>;
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;
export type CaseCustomerContext = z.infer<typeof CaseCustomerContextSchema>;
export const CaseCustomerBindingSchema = CaseCustomerContextSchema.shape.binding.unwrap();
export const emptyCustomer: CustomerFields = {
  name: "",
  registrationNumber: "",
  address: "",
  postalCode: "",
  city: "",
  country: "Danmark",
  archived: false,
};
export const emptyCustomerContact = { name: "", title: "", email: "", phone: "", archived: false };
