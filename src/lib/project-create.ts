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
    select: (columns: "id, slug") => {
      eq: (
        column: "id",
        id: string,
      ) => {
        maybeSingle: () => PromiseLike<{
          data: { id: string; slug: string | null } | null;
          error: ProjectCreateDatabaseError | null;
        }>;
      };
    };
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

/** The INSERT committed; a failed confirmation must not prompt another create. */
export class ProjectCreateConfirmationError extends Error {
  readonly projectId: string;

  constructor(projectId: string, cause: unknown) {
    super(
      `Projektet er gemt med ID ${projectId}, men kunne ikke genindlæses. Åbn det gemte projekt eller genindlæs projektlisten. Opret ikke projektet igen.`,
      { cause },
    );
    this.name = "ProjectCreateConfirmationError";
    this.projectId = projectId;
  }
}

export function canCreateProject(role: string | null | undefined): boolean {
  return PROJECT_CREATOR_ROLES.has(role?.trim().toLowerCase() ?? "");
}

export function projectCreateErrorMessage(error: unknown): string {
  if (error instanceof ProjectCreateConfirmationError) return error.message;
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
): Promise<{ id: string; slug: string | null }> {
  const id = idFactory();

  // The projects SELECT policy resolves access by re-reading the projects row.
  // Postgres cannot see that row from the same INSERT ... RETURNING command,
  // so create with a known id and read it in a separate committed request.
  const { error } = await client.from("projects").insert({ ...input, id });

  if (error) throw new ProjectCreateRequestError(error);

  try {
    const { data, error: readError } = await client
      .from("projects")
      .select("id, slug")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!data || data.id !== id || (data.slug !== null && typeof data.slug !== "string")) {
      throw new Error("Databasen bekræftede ikke det gemte projekt.");
    }
    return data;
  } catch (confirmationError) {
    throw new ProjectCreateConfirmationError(id, confirmationError);
  }
}
