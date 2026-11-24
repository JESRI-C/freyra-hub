export function assertPostgisProbeTarget(input: {
  ci: string | undefined;
  args: readonly string[];
  apiUrl?: string;
  databaseUrl?: string;
}): string;
export function canonicalPostgisDump(text: string, kind: "schema" | "data"): string;
