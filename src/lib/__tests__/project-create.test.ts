import { describe, expect, it, vi } from "vitest";
import {
  ProjectCreateRequestError,
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
  it("inserts the current tenant with a known id and does not request RETURNING data", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn().mockReturnValue({ insert }),
    } as unknown as ProjectsInsertClient;

    await expect(
      insertProjectWithoutRepresentation(
        client,
        INPUT,
        () => "10000000-0000-4000-8000-000000000001",
      ),
    ).resolves.toEqual({ id: "10000000-0000-4000-8000-000000000001", slug: null });

    expect(client.from).toHaveBeenCalledWith("projects");
    expect(insert).toHaveBeenCalledWith({
      id: "10000000-0000-4000-8000-000000000001",
      ...INPUT,
    });
  });

  it("preserves the Postgres error code for safe user-facing mapping", async () => {
    const client = {
      from: () => ({
        insert: () =>
          Promise.resolve({
            error: {
              code: "42501",
              message: 'new row violates row-level security policy for table "projects"',
            },
          }),
      }),
    } satisfies ProjectsInsertClient;

    await expect(insertProjectWithoutRepresentation(client, INPUT)).rejects.toMatchObject({
      name: "ProjectCreateRequestError",
      code: "42501",
    });
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
});
