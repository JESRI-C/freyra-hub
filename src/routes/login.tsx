import { createFileRoute, useNavigate, Navigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, Mail, Loader2, Eye, EyeOff, ArrowLeft, CheckCircle2, Info, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import logoMark from "@/assets/gofreyra-logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind — GoFreyra" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: LoginPage,
});

type Mode = "signin" | "signup" | "forgot";

// Accept only same-origin relative paths so an attacker cannot redirect
// through login to an external URL.
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// Oversæt engelske Supabase-fejlbeskeder til klar dansk
function translateError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Forkert email eller adgangskode. Tjek at du har skrevet begge korrekt.";
  if (m.includes("email not confirmed")) return "Din email er ikke bekræftet endnu. Tjek din indbakke (og spam) for bekræftelsesmailen.";
  if (m.includes("user already registered")) return "Der findes allerede en konto med denne email. Prøv at logge ind i stedet.";
  if (m.includes("password should be at least")) return "Adgangskoden skal være mindst 6 tegn lang.";
  if (m.includes("unable to validate email")) return "Ugyldig email-adresse.";
  if (m.includes("rate limit") || m.includes("too many")) return "For mange forsøg. Vent et par minutter og prøv igen.";
  if (m.includes("network")) return "Netværksfejl. Tjek din internetforbindelse og prøv igen.";
  return message;
}

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const nextPath = safeNext(next);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  if (!loading && user) {
    if (nextPath) return <Navigate to={nextPath} />;
    return <Navigate to="/select" />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        toast.success("Du er logget ind");
        if (nextPath) window.location.href = nextPath;
        else navigate({ to: "/select" });
      } else if (mode === "signup") {
        if (password.length < 6) {
          toast.error("Adgangskoden skal være mindst 6 tegn lang.");
          setBusy(false);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${nextPath ?? "/select"}`,
            data: { full_name: fullName.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
        // Hvis identities-arrayet er tomt, findes brugeren allerede
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          toast.error("Der findes allerede en konto med denne email. Prøv at logge ind.");
          setMode("signin");
        } else {
          setSignupSuccess(true);
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setForgotSent(true);
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Ukendt fejl";
      toast.error(translateError(raw));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}${nextPath ?? ""}`,
      });
      if (result.error) throw result.error;
      if (result.redirected) return;
      if (nextPath) window.location.href = nextPath;
      else navigate({ to: "/select" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google-login fejlede";
      toast.error(translateError(msg));
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { k: "120+", v: "Datakilder" },
    { k: "Metodeklar", v: "Biodiversitet med kontekst" },
    { k: "Rapportklar", v: "Til kommune, fond og ESG" },
  ];

  // Success-visning efter signup — brugeren skal bekræfte via email
  if (signupSuccess) {
    return (
      <SplitShell stats={stats}>
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Tjek din email</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Vi har sendt en bekræftelsesmail til <strong className="text-foreground">{email}</strong>.
              Klik på linket i mailen for at aktivere din konto og komme i gang.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-left text-xs text-muted-foreground space-y-2">
            <div className="flex gap-2">
              <Info className="h-4 w-4 shrink-0 text-primary mt-0.5" />
              <div>
                <strong className="text-foreground">Kan du ikke se mailen?</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Tjek din spam- eller uønsket post-mappe</li>
                  <li>Kontrollér at emailen er skrevet korrekt</li>
                  <li>Bekræftelsesmailen kan tage op til 5 minutter</li>
                </ul>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setSignupSuccess(false);
              setMode("signin");
              setPassword("");
            }}
            className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Tilbage til log ind
          </button>
        </div>
      </SplitShell>
    );
  }

  // Success-visning efter forgot-password
  if (forgotSent) {
    return (
      <SplitShell stats={stats}>
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Nulstillingslink sendt</h2>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Hvis <strong className="text-foreground">{email}</strong> er tilknyttet en konto, har vi sendt et link
              til at nulstille din adgangskode. Tjek din indbakke — og evt. spam-mappen.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setForgotSent(false);
              setMode("signin");
            }}
            className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Tilbage til log ind
          </button>
        </div>
      </SplitShell>
    );
  }

  const isForgot = mode === "forgot";
  const isSignup = mode === "signup";

  return (
    <SplitShell stats={stats}>
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
        <div className="lg:hidden flex items-center gap-2 mb-2">
          <img src={logoMark} alt="GoFreyra" className="h-9 w-9 object-contain" />
          <span className="font-semibold">GoFreyra</span>
        </div>

        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {isForgot ? "Glemt adgangskode?" : isSignup ? "Opret konto" : "Velkommen tilbage"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            {isForgot
              ? "Indtast din email, så sender vi dig et link til at nulstille din adgangskode."
              : isSignup
                ? "Opret en gratis konto for at komme i gang med at dokumentere naturkapital. Du modtager en bekræftelsesmail."
                : "Log ind med din email og adgangskode for at fortsætte til dit GoFreyra-workspace."}
          </p>
        </div>

        {isSignup && (
          <Field label="Fulde navn" icon={<User className="h-4 w-4" />}>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Fx Jesper Riel"
              autoComplete="name"
            />
          </Field>
        )}

        <Field
          label="Email"
          icon={<Mail className="h-4 w-4" />}
          hint={isSignup ? "Vi bruger din arbejdsemail til bekræftelse og notifikationer." : undefined}
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="dig@firma.dk"
            autoComplete="email"
            inputMode="email"
          />
        </Field>

        {!isForgot && (
          <Field
            label={
              <div className="flex items-center justify-between w-full">
                <span>Adgangskode</span>
                {!isSignup && (
                  <button
                    type="button"
                    onClick={() => setMode("forgot")}
                    className="text-xs text-primary hover:underline font-normal"
                  >
                    Glemt?
                  </button>
                )}
              </div>
            }
            icon={<Lock className="h-4 w-4" />}
            hint={isSignup ? "Mindst 6 tegn. Brug gerne en kombination af bogstaver, tal og symboler." : undefined}
          >
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-input bg-card pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
              autoComplete={isSignup ? "new-password" : "current-password"}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-[30px] p-1.5 text-muted-foreground hover:text-foreground rounded-md"
              aria-label={showPassword ? "Skjul adgangskode" : "Vis adgangskode"}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </Field>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {isForgot ? "Send nulstillingslink" : isSignup ? "Opret konto" : "Log ind"}
        </button>

        {!isForgot && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-2 text-muted-foreground">eller fortsæt med</span>
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
              Google
            </button>
          </>
        )}

        <div className="text-xs text-muted-foreground text-center pt-2">
          {isForgot ? (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Tilbage til log ind
            </button>
          ) : isSignup ? (
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
          ) : (
            <>
              Ny på GoFreyra?{" "}
              <button
                type="button"
                onClick={() => setMode("signup")}
                className="text-primary hover:underline font-medium"
              >
                Opret en konto
              </button>
            </>
          )}
        </div>

        {isSignup && (
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed pt-1">
            Ved at oprette en konto accepterer du vores vilkår og databehandling.
            Dine data behandles fortroligt og deles ikke uden dit samtykke.
          </p>
        )}
      </form>
    </SplitShell>
  );
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium block">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            {icon}
          </span>
        )}
        {children}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  );
}

function SplitShell({ children, stats }: { children: React.ReactNode; stats: { k: string; v: string }[] }) {
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
        {children}
      </div>
    </div>
  );
}

// Suppress unused-import warnings for Link (kept for future in-form navigation)
void Link;
