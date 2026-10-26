import { describe, expect, it, vi } from "vitest";
import {
  ProjectCreateRequestError,
  ProjectCreateConfirmationError,
  canCreateProject,
  insertProjectWithoutRepresentation,
  projectCreateErrorMessage,
  type ProjectCreateInput,
  type ProjectsInsertClient,
} from "@/lib/project-create";

const INPUT: ProjectCreateInput = {
  organization_id: "acf1ab43-d228-4d06-9cad-7aca6f6e6b9e",
  name: "Vejle",
  description: "CS",
  project_type: "Naturgenopretning",
  location_name: "Aale",
  status: "Planlægning",
  country: "Denmark",
};

describe("project creation access", () => {
  it.each(["owner", "admin", "editor", " OWNER "])("allows %s", (role) => {
    expect(canCreateProject(role)).toBe(true);
  });

  it.each(["viewer", "field", "external", "", null, undefined])("rejects %s", (role) => {
    expect(canCreateProject(role)).toBe(false);
  });
});

describe("insertProjectWithoutRepresentation", () => {
  const id = "10000000-0000-4000-8000-000000000001";

  function setup() {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id, slug: null }, error: null });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const client = {
      from: vi.fn().mockReturnValue({ insert, select }),
    } satisfies ProjectsInsertClient;
    return { client, insert, select, eq, maybeSingle };
  }

  it("commits the insert without RETURNING before confirming the known id in a separate request", async () => {
    const { client, insert, select, eq, maybeSingle } = setup();
    let acknowledgeInsert!: (result: { error: null }) => void;
    insert.mockImplementationOnce(
      () =>
        new Promise<{ error: null }>((resolve) => {
          acknowledgeInsert = resolve;
        }),
    );
    const creating = insertProjectWithoutRepresentation(client, INPUT, () => id);

    expect(select).not.toHaveBeenCalled();
    expect(maybeSingle).not.toHaveBeenCalled();
    acknowledgeInsert({ error: null });
    await expect(creating).resolves.toEqual({ id, slug: null });

    expect(client.from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalledWith({
      ...INPUT,
      id,
    });
    expect(client.from).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledExactlyOnceWith("id, slug");
    expect(eq).toHaveBeenCalledExactlyOnceWith("id", id);
  });

  it("returns the persisted slug rather than assuming the submitted/default slug", async () => {
    const { client, maybeSingle } = setup();
    maybeSingle.mockResolvedValueOnce({ data: { id, slug: "stored-slug" }, error: null });
    await expect(insertProjectWithoutRepresentation(client, INPUT, () => id)).resolves.toEqual({
      id,
      slug: "stored-slug",
    });
  });

  it("preserves the Postgres error code for safe user-facing mapping", async () => {
    const { client, insert, select } = setup();
    insert.mockResolvedValueOnce({
      error: {
        code: "42501",
        message: 'new row violates row-level security policy for table "projects"',
      },
    });

    await expect(insertProjectWithoutRepresentation(client, INPUT)).rejects.toMatchObject({
      name: "ProjectCreateRequestError",
      code: "42501",
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each([null, { id: "different-project", slug: null }])(
    "does not fabricate a persisted project when confirmation returns %j",
    async (data) => {
      const { client, insert, maybeSingle } = setup();
      maybeSingle.mockResolvedValueOnce({ data, error: null });
      await expect(
        insertProjectWithoutRepresentation(client, INPUT, () => id),
      ).rejects.toMatchObject({
        name: "ProjectCreateConfirmationError",
        projectId: id,
      });
      expect(insert).toHaveBeenCalledOnce();
    },
  );

  it.each(["database", "network"])(
    "retains the committed id and original %s error when confirmation fails",
    async (kind) => {
      const { client, insert, maybeSingle } = setup();
      const failure = { code: "42501", message: "read unavailable" };
      if (kind === "database") maybeSingle.mockResolvedValueOnce({ data: null, error: failure });
      else maybeSingle.mockRejectedValueOnce(failure);
      await expect(
        insertProjectWithoutRepresentation(client, INPUT, () => id),
      ).rejects.toMatchObject({
        name: "ProjectCreateConfirmationError",
        projectId: id,
        cause: failure,
      });
      expect(insert).toHaveBeenCalledOnce();
    },
  );

  it("does not let an extra runtime field override the generated id", async () => {
    const { client, insert } = setup();
    await insertProjectWithoutRepresentation(
      client,
      { ...INPUT, ...{ id: "client-id" } },
      () => id,
    );
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });
});

describe("projectCreateErrorMessage", () => {
  it("maps RLS denials to a Danish action message without exposing database text", () => {
    const message = projectCreateErrorMessage(
      new ProjectCreateRequestError({
        code: "42501",
        message: 'new row violates row-level security policy for table "projects"',
      }),
    );

    expect(message).toContain("ikke rettighed");
    expect(message).toContain("ejer, administrator eller redaktør");
    expect(message).not.toContain("row-level security");
  });

  it("uses a neutral retry message for unexpected failures", () => {
    expect(projectCreateErrorMessage(new Error("network detail"))).toContain("Prøv igen");
  });

  it("distinguishes a committed project from a failed create and avoids duplicate-retry advice", () => {
    const id = "10000000-0000-4000-8000-000000000001";
    const message = projectCreateErrorMessage(
      new ProjectCreateConfirmationError(id, new Error("network")),
    );
    expect(message).toContain("Projektet er gemt");
    expect(message).toContain(id);
    expect(message).toContain("Opret ikke projektet igen");
    expect(message).not.toContain("Prøv igen");
  });
});
