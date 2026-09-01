export type QueryCacheClearer = {
  clear: () => void;
};

export type AuthUserId = string | null | undefined;

/**
 * `undefined` represents the not-yet-hydrated initial state. Hydrating the
 * first session is not an account transition, while every later identity
 * change is.
 */
export function didAuthUserChange(previousUserId: AuthUserId, nextUserId: string | null): boolean {
  return previousUserId !== undefined && previousUserId !== nextUserId;
}

export function clearQueryCacheForAuthTransition(
  queryCache: QueryCacheClearer,
  previousUserId: AuthUserId,
  nextUserId: string | null,
): boolean {
  if (!didAuthUserChange(previousUserId, nextUserId)) return false;
  queryCache.clear();
  return true;
}

export function clearQueryCacheForLogout(queryCache: QueryCacheClearer): void {
  queryCache.clear();
}
