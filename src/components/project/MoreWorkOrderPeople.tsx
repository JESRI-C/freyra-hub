import type { useWorkOrderPeople } from "./useWorkOrderPeople";
export function MoreWorkOrderPeople({ query }: { query: ReturnType<typeof useWorkOrderPeople> }) {
  return query.hasNextPage || query.isError ? (
    <button
      type="button"
      className="min-h-11 rounded-xl border px-3 text-sm"
      disabled={query.isFetching}
      onClick={() => void (query.isError ? query.refetch() : query.fetchNextPage())}
    >
      {query.isFetching
        ? "Henter personer…"
        : query.isError
          ? "Hent personlisten igen"
          : "Hent flere personer"}
    </button>
  ) : null;
}
