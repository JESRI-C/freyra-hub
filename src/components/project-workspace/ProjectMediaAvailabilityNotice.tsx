export function ProjectMediaAvailabilityNotice({
  failed,
  fetching,
  onRetry,
}: {
  failed: boolean;
  fetching: boolean;
  onRetry: () => void;
}) {
  return (
    <div
      role={failed ? "alert" : "status"}
      className="space-y-2 rounded-xl border bg-muted/20 p-3 text-sm"
    >
      <p>
        {failed
          ? "Projektets medier kunne ikke kontrolleres. Mediegrundlaget er uafklaret; åbne kladder bevares."
          : "Kontrollerer projektets medier… Mediegrundlaget afventer kontrol."}
      </p>
      {failed && (
        <button
          type="button"
          className="min-h-11 rounded-lg border bg-background px-3 font-medium"
          disabled={fetching}
          onClick={onRetry}
        >
          Hent medier igen
        </button>
      )}
    </div>
  );
}
