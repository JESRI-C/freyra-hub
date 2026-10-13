import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SEED_PROJECTS } from "@/data/platform-seed";

const database = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const insert = vi.fn();
  return {
    maybeSingle,
    eq,
    select,
    insert,
    from: vi.fn(() => ({ insert, select })),
    audit: vi.fn(),
  };
});
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { from: database.from },
}));
vi.mock("@/services/audit-service", () => ({
  logAuditEvent: database.audit,
  getAuditEventsByProject: vi.fn(),
}));

import { insertProject } from "@/lib/supabase/queries";
import { createProject } from "@/services/projects-service";

const ID = "10000000-0000-4000-8000-000000000001";
const INPUT = { name: "Byskov Bæk", slug: "byskov-baek", organization_id: "customer-org" };
const STORED_PROJECT = { ...SEED_PROJECTS[0], ...INPUT, id: ID, status: "planning" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, "randomUUID").mockReturnValue(ID);
  database.insert.mockReset().mockResolvedValue({ error: null });
  database.maybeSingle.mockReset().mockResolvedValue({ data: STORED_PROJECT, error: null });
  database.audit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("project query committed confirmation", () => {
  it("never requests an INSERT representation and waits for acknowledgement before SELECT", async () => {
    let acknowledgeInsert!: (result: { error: null }) => void;
    database.insert.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          acknowledgeInsert = resolve;
        }),
    );
    const creation = insertProject(INPUT);

    expect(database.insert).toHaveBeenCalledExactlyOnceWith({ ...INPUT, id: ID });
    expect(database.select).not.toHaveBeenCalled();
    acknowledgeInsert({ error: null });
    await expect(creation).resolves.toBe(STORED_PROJECT);

    expect(database.from).toHaveBeenCalledTimes(2);
    expect(database.select).toHaveBeenCalledExactlyOnceWith("*");
    expect(database.eq).toHaveBeenCalledExactlyOnceWith("id", ID);
  });

  it("preserves an INSERT denial without attempting confirmation or success audit", async () => {
    const failure = { code: "42501", message: "insert denied" };
    database.insert.mockResolvedValueOnce({ error: failure });
    await expect(createProject(INPUT)).rejects.toBe(failure);
    expect(database.select).not.toHaveBeenCalled();
    expect(database.audit).not.toHaveBeenCalled();
  });

  it.each([null, { ...STORED_PROJECT, id: "different-project" }])(
    "does not report create success or audit when stored-row confirmation is %j",
    async (data) => {
      database.maybeSingle.mockResolvedValueOnce({ data, error: null });
      await expect(createProject(INPUT)).rejects.toMatchObject({
        name: "ProjectCreateConfirmationError",
        projectId: ID,
      });
      expect(database.insert).toHaveBeenCalledOnce();
      expect(database.audit).not.toHaveBeenCalled();
    },
  );

  it.each(["database", "network"])(
    "preserves %s confirmation failure and never retries the committed INSERT",
    async (kind) => {
      const failure = { code: "42501", message: "read failed" };
      if (kind === "database")
        database.maybeSingle.mockResolvedValueOnce({ data: null, error: failure });
      else database.maybeSingle.mockRejectedValueOnce(failure);
      await expect(createProject(INPUT)).rejects.toMatchObject({
        name: "ProjectCreateConfirmationError",
        projectId: ID,
        cause: failure,
      });
      expect(database.insert).toHaveBeenCalledOnce();
      expect(database.audit).not.toHaveBeenCalled();
    },
  );

  it("audits only after the real stored row is confirmed", async () => {
    database.maybeSingle.mockResolvedValueOnce({
      data: { ...STORED_PROJECT, slug: "stored-slug" },
      error: null,
    });
    await expect(createProject(INPUT)).resolves.toEqual({ ...STORED_PROJECT, slug: "stored-slug" });
    expect(database.insert).toHaveBeenCalledExactlyOnceWith({
      ...INPUT,
      id: ID,
      status: "planning",
    });
    expect(database.audit).toHaveBeenCalledOnce();
    expect(database.audit).toHaveBeenCalledWith(
      expect.objectContaining({ project_id: ID, event_type: "project_created" }),
    );
    expect(database.maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(
      database.audit.mock.invocationCallOrder[0],
    );
  });
});
