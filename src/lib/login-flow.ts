export function safeLoginNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;

  try {
    const base = "https://gofreyra.invalid";
    if (new URL(next, base).origin !== base) return null;
  } catch {
    return null;
  }

  return next;
}

export function resolveLoginDestination({
  loading,
  hasUser,
  next,
}: {
  loading: boolean;
  hasUser: boolean;
  next: string | undefined;
}): string | null {
  if (loading || !hasUser) return null;
  return safeLoginNext(next) ?? "/select";
}
