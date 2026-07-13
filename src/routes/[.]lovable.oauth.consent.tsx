import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// The supabase.auth.oauth namespace is beta — provide a local typed wrapper.
interface OAuthApi {
  getAuthorizationDetails(id: string): Promise<{
    data: {
      client?: { name?: string } | null;
      redirect_url?: string;
      redirect_to?: string;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization(
    id: string,
  ): Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization(
    id: string,
  ): Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
}
function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-sm text-destructive">
        Could not load this authorization request: {String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "en ekstern applikation";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Autorisationsserveren returnerede ikke en redirect-URL.");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            Forbind {clientName} til din GoFreyra-konto
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {clientName} vil kunne bruge GoFreyra som dig og tilgå de projekter,
            data og handlinger, du selv har adgang til. Du kan altid trække
            adgangen tilbage.
          </p>
        </div>
        {error && (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="rounded-xl border px-4 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
          >
            Afvis
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Vent…" : "Godkend"}
          </button>
        </div>
      </div>
    </main>
  );
}
