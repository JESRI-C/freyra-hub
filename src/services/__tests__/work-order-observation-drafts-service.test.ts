import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ObservationDraftSource,
  WorkOrderObservationOrigin,
} from "@/lib/work-order-observation-drafts";
import {
  createObservationDraft,
  getObservationDraft,
  listObservationSources,
} from "../work-order-observation-drafts-service";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = id(1),
  organization = id(2),
  project = id(3),
  action = id(4),
  requestId = id(5);
const input = { expectedActorId: actor, organizationId: organization, projectId: project };
const rpc = vi.fn();
const client = { rpc };
const source = (n = 10): ObservationDraftSource => ({
  observation_id: id(n),
  source_hash: "a".repeat(64),
  snapshot: {
    id: id(n),
    project_id: project,
    zone_id: null,
    observation_type: "field",
    observed_at: null,
    observer_id: null,
    species_name: null,
    species_confidence: null,
    count_value: null,
    latitude: "NaN",
    longitude: null,
    accuracy_m: null,
    notes: "Original source note",
    visibility: "restricted",
    status: "draft",
    metadata: { quality: null },
    created_at: null,
    updated_at: null,
  },
  media_refs: [],
});
const origin = (): WorkOrderObservationOrigin => ({
  organization_id: organization,
  project_id: project,
  user_id: actor,
  action_id: action,
  request_id: requestId,
  created_by: actor,
  created_at: "2026-11-04T06:00:00Z",
  title: "Check the observation",
  description: "Inspect at the next visit",
  status: "draft",
  sources: [source()],
});
const createInput = () => ({
  ...input,
  actionId: action,
  requestId,
  title: "  Check the observation ",
  description: " Inspect at the next visit  ",
  sources: [{ observationId: id(10), sourceHash: "A".repeat(64) }],
});
const listReceipt = (items = [source()]) => ({
  organization_id: organization,
  project_id: project,
  user_id: actor,
  items,
});
const getReceipt = (stored: WorkOrderObservationOrigin | null = origin()) => ({
  organization_id: organization,
  project_id: project,
  user_id: actor,
  action_id: action,
  origin: stored,
});
const reply = (data: unknown) => rpc.mockResolvedValue({ data: [data], error: null });

beforeEach(() => rpc.mockReset());

describe("scoped observation draft source selection", () => {
  it("requests scoped defaults and keeps a sentinel out of the returned page", async () => {
    reply(listReceipt([source(10), source(11), source(12)]));
    const page = await listObservationSources(client, actor, {
      ...input,
      pageSize: 2,
      search: "  reed  ",
    });
    expect(page).toEqual({ items: [source(10), source(11)], nextCursor: id(11) });
    expect(rpc).toHaveBeenCalledWith("list_work_order_observation_sources", {
      p_organization_id: organization,
      p_project_id: project,
      p_after_observation_id: null,
      p_page_size: 2,
      p_search: "reed",
    });
  });
  it("represents an authorized empty source list without inventing an observation", async () => {
    reply(listReceipt([]));
    expect(await listObservationSources(client, actor, input)).toEqual({
      items: [],
      nextCursor: null,
    });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_page_size: 30, p_search: "" });
  });
  it.each(["organization_id", "project_id", "user_id"])(
    "rejects a foreign list %s",
    async (field) => {
      reply({ ...listReceipt(), [field]: id(99) });
      await expect(listObservationSources(client, actor, input)).rejects.toMatchObject({
        code: "access",
      });
    },
  );
  it("rejects a source snapshot belonging to a different project", async () => {
    const s = source();
    reply(listReceipt([{ ...s, snapshot: { ...s.snapshot, project_id: id(99) } }]));
    await expect(listObservationSources(client, actor, input)).rejects.toMatchObject({
      code: "access",
    });
  });
  it.each([{ items: [source(10), source(10)] }, { items: [source(11), source(10)] }])(
    "rejects duplicate or unsorted sources",
    async ({ items }) => {
      reply(listReceipt(items));
      await expect(listObservationSources(client, actor, input)).rejects.toMatchObject({
        code: "unavailable",
      });
    },
  );
  it("rejects a row at or before the cursor and a response larger than its sentinel allowance", async () => {
    reply(listReceipt());
    await expect(
      listObservationSources(client, actor, { ...input, cursor: id(10) }),
    ).rejects.toMatchObject({ code: "unavailable" });
    reply(listReceipt([source(10), source(11), source(12)]));
    await expect(
      listObservationSources(client, actor, { ...input, pageSize: 1 }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
  it("rejects malformed source hashes or unexpected server envelope fields", async () => {
    reply(listReceipt([{ ...source(), source_hash: "unknown" }]));
    await expect(listObservationSources(client, actor, input)).rejects.toMatchObject({
      code: "unavailable",
    });
    reply({ ...listReceipt(), verifiedOriginals: true });
    await expect(listObservationSources(client, actor, input)).rejects.toMatchObject({
      code: "unavailable",
    });
  });
});

describe("create a work order from exact observation source hashes", () => {
  it("sends normalized input and preserves the same mutation identity on retry", async () => {
    reply(origin());
    const first = await createObservationDraft(client, actor, createInput());
    const retry = await createObservationDraft(client, actor, createInput());
    expect(first).toEqual(retry);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(rpc).toHaveBeenCalledWith("create_work_order_observation_draft", {
      p_action_id: action,
      p_organization_id: organization,
      p_project_id: project,
      p_title: "Check the observation",
      p_description: "Inspect at the next visit",
      p_sources: [{ observationId: id(10), sourceHash: "a".repeat(64) }],
      p_request_id: requestId,
    });
  });
  it("accepts canonical server order without changing the selected sources", async () => {
    reply({ ...origin(), sources: [source(10), source(11)] });
    const selected = [
      { observationId: id(11), sourceHash: "a".repeat(64) },
      { observationId: id(10), sourceHash: "a".repeat(64) },
    ];
    expect(
      (await createObservationDraft(client, actor, { ...createInput(), sources: selected }))
        .sources,
    ).toEqual([source(10), source(11)]);
  });
  it.each(["organization_id", "project_id", "user_id", "action_id"])(
    "rejects wrong receipt scope %s",
    async (field) => {
      reply({ ...origin(), [field]: id(99) });
      await expect(createObservationDraft(client, actor, createInput())).rejects.toMatchObject({
        code: "access",
      });
    },
  );
  it.each([
    { request_id: id(99) },
    { created_by: id(99) },
    { title: "A different task" },
    { description: "A different instruction" },
    { sources: [source(11)] },
    { sources: [{ ...source(), source_hash: "b".repeat(64) }] },
    { sources: [source(), source()] },
    { status: "approved" },
  ])("rejects a different or malformed creation receipt %j", async (change) => {
    reply({ ...origin(), ...change });
    await expect(createObservationDraft(client, actor, createInput())).rejects.toMatchObject({
      code: "unavailable",
    });
  });
  it("does not recompute the server metadata hash or claim file verification", async () => {
    const s = source();
    const preserved = {
      ...s,
      snapshot: { ...s.snapshot, metadata: { quality: "unknown", extra: [true, null] } },
    };
    reply({ ...origin(), sources: [preserved] });
    const result = await createObservationDraft(client, actor, createInput());
    expect(result.sources[0]).toEqual(preserved);
    expect(result.sources[0]).not.toHaveProperty("verifiedOriginal");
  });
  it.each([
    { code: "PT409", expected: "conflict", status: 409 },
    { code: "42501", expected: "access", status: 403 },
    { code: "22023", expected: "validation", status: 422 },
  ])(
    "maps the authoritative RPC rejection $code without exposing its details",
    async ({ code, expected, status }) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: "Private source detail" } });
      await expect(createObservationDraft(client, actor, createInput())).rejects.toMatchObject({
        code: expected,
        statusCode: status,
      });
      await expect(createObservationDraft(client, actor, createInput())).rejects.not.toHaveProperty(
        "message",
        "Private source detail",
      );
    },
  );
});

describe("read immutable observation origins", () => {
  it("returns authorized null for an ordinary task and validates its identity", async () => {
    reply(getReceipt(null));
    expect(await getObservationDraft(client, actor, { ...input, actionId: action })).toBeNull();
    expect(rpc).toHaveBeenCalledWith("get_work_order_observation_draft", {
      p_action_id: action,
      p_organization_id: organization,
      p_project_id: project,
    });
  });
  it("allows a different current manager to read the original creator's receipt", async () => {
    const stored = { ...origin(), created_by: id(99) };
    reply(getReceipt(stored));
    expect(await getObservationDraft(client, actor, { ...input, actionId: action })).toEqual(
      stored,
    );
  });
  it.each(["organization_id", "project_id", "user_id", "action_id"])(
    "rejects wrong get envelope %s even when origin is null",
    async (field) => {
      reply({ ...getReceipt(null), [field]: id(99) });
      await expect(
        getObservationDraft(client, actor, { ...input, actionId: action }),
      ).rejects.toMatchObject({ code: "access" });
    },
  );
  it.each(["organization_id", "project_id", "user_id", "action_id"])(
    "rejects a foreign nested origin %s",
    async (field) => {
      reply(getReceipt({ ...origin(), [field]: id(99) }));
      await expect(
        getObservationDraft(client, actor, { ...input, actionId: action }),
      ).rejects.toMatchObject({ code: "access" });
    },
  );
  it("does not turn an access failure or missing envelope into an empty origin", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      getObservationDraft(client, actor, { ...input, actionId: action }),
    ).rejects.toMatchObject({ code: "access" });
    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      getObservationDraft(client, actor, { ...input, actionId: action }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("caller and mutation boundaries", () => {
  it("rejects a different expected actor before any RPC", async () => {
    await expect(
      listObservationSources(client, actor, { ...input, expectedActorId: id(99) }),
    ).rejects.toMatchObject({ code: "access" });
    await expect(
      createObservationDraft(client, actor, { ...createInput(), expectedActorId: id(99) }),
    ).rejects.toMatchObject({ code: "access" });
    await expect(
      getObservationDraft(client, actor, { ...input, actionId: action, expectedActorId: id(99) }),
    ).rejects.toMatchObject({ code: "access" });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects duplicate selection, invalid hashes and oversized pages before any RPC", async () => {
    await expect(
      createObservationDraft(client, actor, {
        ...createInput(),
        sources: [createInput().sources[0], createInput().sources[0]],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      createObservationDraft(client, actor, {
        ...createInput(),
        sources: [{ observationId: id(10), sourceHash: "bad" }],
      }),
    ).rejects.toMatchObject({ code: "validation" });
    await expect(
      listObservationSources(client, actor, { ...input, pageSize: 51 }),
    ).rejects.toMatchObject({ code: "validation" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
