import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, Loader2, Eye, EyeOff, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import logoMark from "@/assets/gofreyra-logo.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nulstil adgangskode — GoFreyra" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase sender bruger til denne side med et recovery-token i URL-fragmentet.
  // onAuthStateChange fyrer PASSWORD_RECOVERY når linket parses.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setValidLink(true);
        setReady(true);
      }
    });

    // Tjek også aktuel session (hvis linket allerede blev håndteret)
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const hash = window.location.hash || "";
      if (data.session || hash.includes("type=recovery") || hash.includes("access_token")) {
        setValidLink(true);
      }
      setReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Adgangskoden skal være mindst 6 tegn lang.");
      return;
    }
    if (password !== confirm) {
      toast.error("De to adgangskoder er ikke ens.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Adgangskode opdateret");
      setTimeout(() => navigate({ to: "/select" }), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kunne ikke opdatere adgangskoden";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-2 justify-center mb-2">
          <img src={logoMark} alt="GoFreyra" className="h-10 w-10 object-contain" />
          <span className="font-semibold text-lg">GoFreyra</span>
        </div>

        {!ready ? (
          <div className="text-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : done ? (
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Adgangskode opdateret</h2>
            <p className="text-sm text-muted-foreground">Sender dig videre til dit workspace…</p>
          </div>
        ) : !validLink ? (
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Ugyldigt eller udløbet link</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Nulstillingslinket er enten forkert, brugt eller udløbet.
              Bed om et nyt link fra log ind-siden.
            </p>
            <button
              onClick={() => navigate({ to: "/login" })}
              className="text-sm text-primary hover:underline font-medium"
            >
              Tilbage til log ind
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Vælg ny adgangskode</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Vælg en ny adgangskode til din GoFreyra-konto. Den skal være mindst 6 tegn.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Ny adgangskode</label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Mindst 6 tegn"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded-md"
                  tabIndex={-1}
                  aria-label={showPassword ? "Skjul" : "Vis"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Bekræft adgangskode</label>
              <div className="relative">
                <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Gentag adgangskoden"
                  autoComplete="new-password"
                />
              </div>
              {confirm && confirm !== password && (
                <p className="text-[11px] text-destructive">Adgangskoderne er ikke ens.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Opdatér adgangskode
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
