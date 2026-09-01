const PROJECT_CREATOR_ROLES = new Set(["owner", "admin", "editor"]);

export interface ProjectCreateInput {
  organization_id: string;
  name: string;
  description: string | null;
  project_type: string;
  location_name: string | null;
  status: string;
  country: string;
}

export interface ProjectCreateDatabaseError {
  code?: string | null;
  message: string;
  details?: string | null;
  hint?: string | null;
}

export interface ProjectsInsertClient {
  from: (table: "projects") => {
    insert: (
      row: ProjectCreateInput & { id: string },
    ) => PromiseLike<{ error: ProjectCreateDatabaseError | null }>;
  };
}

export class ProjectCreateRequestError extends Error {
  readonly code: string | null;

  constructor(error: ProjectCreateDatabaseError) {
    super(error.message);
    this.name = "ProjectCreateRequestError";
    this.code = error.code ?? null;
  }
}

export function canCreateProject(role: string | null | undefined): boolean {
  return PROJECT_CREATOR_ROLES.has(role?.trim().toLowerCase() ?? "");
}

export function projectCreateErrorMessage(error: unknown): string {
  const code = error instanceof ProjectCreateRequestError ? error.code : null;
  const message = error instanceof Error ? error.message : "";

  if (code === "42501" || /row-level security policy/i.test(message)) {
    return "Du har ikke rettighed til at oprette projekter i den valgte organisation. Vælg en arbejdsplads, hvor du er ejer, administrator eller redaktør.";
  }

  return "Projektet kunne ikke oprettes. Prøv igen, eller genindlæs siden hvis fejlen fortsætter.";
}

export async function insertProjectWithoutRepresentation(
  client: ProjectsInsertClient,
  input: ProjectCreateInput,
  idFactory: () => string = () => crypto.randomUUID(),
): Promise<{ id: string; slug: null }> {
  const id = idFactory();

  // The projects SELECT policy resolves access by re-reading the projects row.
  // Postgres cannot see that row from the same INSERT ... RETURNING command,
  // so create with a known id and let the next request read it normally.
  const { error } = await client.from("projects").insert({ id, ...input });

  if (error) throw new ProjectCreateRequestError(error);

  return { id, slug: null };
}
