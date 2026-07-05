import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Mail, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import logoMark from "@/assets/gofreyra-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind — GoFreyra" }] }),
  component: LoginPage,
});

type Mode = "signin" | "signup";

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/select" />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Logget ind");
        navigate({ to: "/select" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/select`,
            data: { full_name: fullName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Konto oprettet — tjek din email for bekræftelse.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ukendt fejl";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/select" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google-login fejlede";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { k: "120+", v: "Datakilder" },
    { k: "Metodeklar", v: "Biodiversitet med kontekst" },
    { k: "Rapportklar", v: "Til kommune, fond og ESG" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex relative overflow-hidden bg-sidebar text-sidebar-foreground p-12 flex-col justify-between">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 600px at 20% 30%, oklch(0.45 0.15 150 / 0.6), transparent 60%), radial-gradient(700px 500px at 80% 90%, oklch(0.55 0.18 145 / 0.4), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <img src={logoMark} alt="GoFreyra" className="h-11 w-11 object-contain" />
          <div>
            <div className="text-lg font-semibold tracking-tight">GoFreyra</div>
            <div className="text-xs text-sidebar-muted">by Freyra</div>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            Mål, dokumentér og handl på{" "}
            <span className="text-leaf">verificeret naturkapital</span>.
          </h1>
          <p className="text-sidebar-muted leading-relaxed">
            Saml naturprojekter, arealdata, målinger, rapportering og dokumentation i
            én platform — bygget til den grønne arealomlægning.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {stats.map((x) => (
              <div key={x.v} className="rounded-xl bg-sidebar-accent/60 p-4 border border-sidebar-border">
                <div className="text-xl font-semibold text-leaf leading-tight">{x.k}</div>
                <div className="text-xs text-sidebar-muted mt-1 leading-snug">{x.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Freyra ApS · Platform for verificeret naturkapital
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <img src={logoMark} alt="GoFreyra" className="h-9 w-9 object-contain" />
            <span className="font-semibold">GoFreyra</span>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Velkommen tilbage" : "Opret konto"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "signin"
                ? "Log ind for at fortsætte til dit GoFreyra workspace."
                : "Kom i gang med at dokumentere naturkapital."}
            </p>
          </div>

          {mode === "signup" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Fulde navn</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-input bg-card px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Jesper Riel"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Email</label>
            <div className="relative">
              <Mail className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="dig@firma.dk"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Adgangskode</label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Log ind" : "Opret konto"}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">eller</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            className="w-full rounded-xl border border-input bg-card py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z" />
            </svg>
            Fortsæt med Google
          </button>

          <div className="text-xs text-muted-foreground text-center pt-2">
            {mode === "signin" ? (
              <>
                Ny på GoFreyra?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-primary hover:underline font-medium"
                >
                  Opret konto
                </button>
              </>
            ) : (
              <>
                Har du allerede en konto?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className="text-primary hover:underline font-medium"
                >
                  Log ind
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
