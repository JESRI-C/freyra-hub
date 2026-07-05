import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, MapPin, ChevronRight, Leaf, LogOut, CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/select")({
  head: () => ({ meta: [{ title: "Vælg arbejdsplads — GoFreyra" }] }),
  component: SelectPage,
});

function SelectPage() {
  const { user, loading, logout, selectOrg, selectProject, orgId, organizations } = useAuth();
  const navigate = useNavigate();
  const [pickedOrg, setPickedOrg] = useState<string | null>(orgId);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  const org = organizations.find((o) => o.id === pickedOrg) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">GoFreyra</div>
              <div className="text-xs text-muted-foreground">Vælg organisation og projekt</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm text-right">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
            </div>
            <button
              onClick={async () => {
                await logout();
                navigate({ to: "/login" });
              }}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              title="Log ud"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Velkommen, {user.name.split(" ")[0]}
          </h1>
          <p className="text-muted-foreground mt-1">
            Vælg din organisation og det projekt du vil arbejde i.
          </p>
        </div>

        {organizations.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">Ingen organisationer endnu</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Du er ikke medlem af nogen organisation. Kontakt en administrator for at blive
              tilføjet, eller kontakt support for at oprette en ny organisation.
            </p>
          </div>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Organisationer
              </h2>
              <div className="space-y-2">
                {organizations.map((o) => {
                  const active = pickedOrg === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => setPickedOrg(o.id)}
                      className={`w-full text-left rounded-2xl border p-4 transition flex items-start gap-3 ${
                        active
                          ? "border-primary bg-card shadow-card"
                          : "border-border bg-card hover:shadow-soft"
                      }`}
                    >
                      <div
                        className={`h-10 w-10 rounded-xl grid place-items-center ${active ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground"}`}
                      >
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{o.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {o.description || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {o.projects.length} projekter · {o.role ?? "member"}
                        </div>
                      </div>
                      {active && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Projekter
              </h2>
              {!org ? (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
                  Vælg en organisation for at se tilgængelige projekter.
                </div>
              ) : org.projects.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
                  Ingen projekter i denne organisation endnu.
                </div>
              ) : (
                <div className="space-y-2">
                  {org.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        selectOrg(org.id);
                        selectProject(p.id);
                        navigate({ to: "/app/overview" });
                      }}
                      className="w-full text-left rounded-2xl border bg-card p-4 hover:shadow-card transition flex items-center gap-3 group"
                    >
                      <div className="h-10 w-10 rounded-xl bg-leaf/20 text-primary grid place-items-center">
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{p.location}</div>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded-full ${p.status === "Aktiv" ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}`}
                      >
                        {p.status}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition" />
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
