import { describe, expect, it } from "vitest";
import {
  CreateWorkOrderObservationDraftInputSchema,
  ListWorkOrderObservationSourcesInputSchema,
  ObservationDraftSourceSchema,
} from "../work-order-observation-drafts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { expectedActorId: id(1), organizationId: id(2), projectId: id(3) };
const source = () => ({
  observation_id: id(10),
  source_hash: "a".repeat(64),
  snapshot: {
    id: id(10),
    project_id: id(3),
    zone_id: null,
    observation_type: "field",
    observed_at: null,
    observer_id: null,
    species_name: null,
    species_confidence: null,
    count_value: 0,
    latitude: "NaN",
    longitude: null,
    accuracy_m: null,
    notes: null,
    visibility: "approximate",
    status: "draft",
    metadata: { precision: null, source: ["field"] },
    created_at: null,
    updated_at: null,
    additional_source_data: { retained: true },
  },
  media_refs: [
    {
      id: id(20),
      observation_id: id(10),
      media_type: "photo",
      storage_path: "stored/reference",
      mime_type: null,
      file_size_bytes: null,
      width: null,
      height: null,
      exif_data: {},
      ai_suggestions: [],
      uploaded_by: null,
      created_at: null,
      additional_metadata: { retained: true },
    },
  ],
});
const input = () => ({
  ...scope,
  actionId: id(4),
  requestId: id(5),
  title: "  Plan a visit  ",
  description: "  Check source  ",
  sources: [{ observationId: id(10), sourceHash: "A".repeat(64) }],
});

describe("observation draft source contracts", () => {
  it("keeps list defaults scoped without selecting a source or inventing search text", () => {
    expect(ListWorkOrderObservationSourcesInputSchema.parse(scope)).toEqual({
      ...scope,
      cursor: null,
      pageSize: 30,
      search: "",
    });
  });
  it("preserves unknown dates, raw NaN, zero, visibility and full source/media JSON", () => {
    const original = source();
    expect(ObservationDraftSourceSchema.parse(original)).toEqual(original);
    expect(ObservationDraftSourceSchema.parse(original)).not.toHaveProperty("verified");
  });
  it("normalizes create identity, hash and text while preserving an empty description", () => {
    expect(
      CreateWorkOrderObservationDraftInputSchema.parse({ ...input(), description: "  " }),
    ).toEqual({
      ...input(),
      title: "Plan a visit",
      description: "",
      sources: [{ observationId: id(10), sourceHash: "a".repeat(64) }],
    });
  });
  it("rejects the same observation twice after case normalization", () => {
    const observationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(
      CreateWorkOrderObservationDraftInputSchema.safeParse({
        ...input(),
        sources: [
          { observationId, sourceHash: "a".repeat(64) },
          { observationId: observationId.toUpperCase(), sourceHash: "b".repeat(64) },
        ],
      }).success,
    ).toBe(false);
  });
  it.each([
    { sources: [] },
    {
      sources: Array.from({ length: 21 }, (_, index) => ({
        observationId: id(10 + index),
        sourceHash: "a".repeat(64),
      })),
    },
    { title: "   " },
    { title: "a".repeat(201) },
    { description: "a".repeat(10001) },
    { sources: [{ observationId: id(10), sourceHash: "not-a-hash" }] },
    { verifiedOriginal: true },
  ])("rejects invalid creation bounds and unsupported assertions %j", (change) => {
    expect(
      CreateWorkOrderObservationDraftInputSchema.safeParse({ ...input(), ...change }).success,
    ).toBe(false);
  });
  it.each([{ pageSize: 51 }, { pageSize: 0 }, { cursor: "wrong" }, { search: "a".repeat(201) }])(
    "rejects invalid source selection %j",
    (change) => {
      expect(
        ListWorkOrderObservationSourcesInputSchema.safeParse({ ...scope, ...change }).success,
      ).toBe(false);
    },
  );
  it("rejects media from a different observation and duplicate or unsorted media ids", () => {
    const s = source();
    expect(
      ObservationDraftSourceSchema.safeParse({
        ...s,
        media_refs: [{ ...s.media_refs[0], observation_id: id(11) }],
      }).success,
    ).toBe(false);
    expect(
      ObservationDraftSourceSchema.safeParse({
        ...s,
        media_refs: [s.media_refs[0], s.media_refs[0]],
      }).success,
    ).toBe(false);
    expect(
      ObservationDraftSourceSchema.safeParse({
        ...s,
        media_refs: [{ ...s.media_refs[0], id: id(21) }, s.media_refs[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects mismatched observation identity, malformed hashes and non-JSON metadata", () => {
    const s = source();
    expect(ObservationDraftSourceSchema.safeParse({ ...s, observation_id: id(11) }).success).toBe(
      false,
    );
    expect(
      ObservationDraftSourceSchema.safeParse({ ...s, source_hash: "g".repeat(64) }).success,
    ).toBe(false);
    expect(
      ObservationDraftSourceSchema.safeParse({
        ...s,
        snapshot: { ...s.snapshot, metadata: { unsafe: () => "no" } },
      }).success,
    ).toBe(false);
  });
});
