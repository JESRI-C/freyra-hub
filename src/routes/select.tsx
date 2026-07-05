import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Building2, MapPin, ChevronRight, Leaf, LogOut, CheckCircle2, Loader2, Plus, X, Info, Users, ShieldCheck, FolderTree } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/select")({
  head: () => ({ meta: [{ title: "Vælg arbejdsplads — GoFreyra" }] }),
  component: SelectPage,
});

const ORG_TYPES = ["Kommune", "Rådgiver", "NGO", "Bygherre", "Forsyning", "Andet"] as const;
type OrgType = (typeof ORG_TYPES)[number];

function SelectPage() {
  const { user, loading, logout, selectOrg, selectProject, orgId, organizations, refresh } = useAuth();
  const navigate = useNavigate();
  const [pickedOrg, setPickedOrg] = useState<string | null>(orgId);
  const [showCreate, setShowCreate] = useState(false);

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

        {/* Info panel — hvordan og hvorfor vi arbejder med organisationer */}
        <div className="mb-6 rounded-2xl border bg-card p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-leaf/20 text-primary grid place-items-center shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Hvordan vi arbejder med organisationer</h3>
              <p className="text-sm text-muted-foreground mt-1">
                En organisation er dit arbejdsrum i GoFreyra — fx en kommune, et rådgiverhus, en NGO
                eller en bygherre. Al data, projekter, konnektorer og rapporter hører til én
                organisation, så det er tydeligt hvem der ejer hvad, og hvem der må se hvad.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 mt-4">
                <div className="flex items-start gap-2">
                  <FolderTree className="h-4 w-4 text-primary mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Projekter samles</span> under
                    organisationen — én natur-, klima- eller vandindsats per projekt.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-primary mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Medlemmer</span> inviteres med
                    roller (ejer, admin, medlem) og deler adgang på tværs af projekter.
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5" />
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground font-medium">Data er isoleret</span> — ingen
                    uden for organisationen kan se jeres målinger, kort eller rapporter.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
            {organizations.length === 0
              ? "Kom i gang ved at oprette din første organisation."
              : `${organizations.length} organisation${organizations.length === 1 ? "" : "er"} tilgængelig${organizations.length === 1 ? "" : "e"}.`}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Opret organisation
          </button>
        </div>

        {organizations.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-medium">Ingen organisationer endnu</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Du er ikke medlem af nogen organisation. Opret din egen som ejer, eller bed en
              administrator om at tilføje dig til en eksisterende.
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
              {org && (
                <button
                  onClick={() => {
                    selectOrg(org.id);
                    selectProject("");
                    navigate({ to: "/app/overview" });
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90"
                >
                  Åbn {org.name}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
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
                  <div className="mt-2 text-xs">
                    Klik <span className="font-medium text-foreground">Åbn {org.name}</span> for at gå ind og oprette dit første projekt.
                  </div>
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

      {showCreate && (
        <CreateOrganizationDialog
          userId={user.id}
          onClose={() => setShowCreate(false)}
          onCreated={async (newOrgId) => {
            await refresh();
            setPickedOrg(newOrgId);
            selectOrg(newOrgId);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function CreateOrganizationDialog({
  userId,
  onClose,
  onCreated,
}: {
  userId: string;
  onClose: () => void;
  onCreated: (orgId: string) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<OrgType>("Kommune");
  const [country, setCountry] = useState("Denmark");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      setError("Navn skal være mellem 2 og 100 tegn.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name: trimmed, type, country: country.trim() || "Denmark" })
        .select("id")
        .single();
      if (orgErr) throw orgErr;
      // Owner-medlemskab tilføjes automatisk af DB-trigger (add_creator_as_owner)
      await onCreated(org.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kunne ikke oprette organisation";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-card border shadow-lg p-6 space-y-4"
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Opret organisation</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Du bliver ejer og kan senere invitere medlemmer og oprette projekter.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
            aria-label="Luk"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block text-sm">
          <span className="text-muted-foreground">Navn</span>
          <input
            type="text"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fx Skallebæk Kommune"
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
            autoFocus
          />
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">Type</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as OrgType)}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {ORG_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-muted-foreground">Land</span>
          <input
            type="text"
            maxLength={80}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-lg text-sm hover:bg-muted"
            disabled={busy}
          >
            Annullér
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Opret
          </button>
        </div>
      </form>
    </div>
  );
}
