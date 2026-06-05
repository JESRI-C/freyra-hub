import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock } from "lucide-react";
import { DEMO_USERS, useAuth } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";
import logoMark from "@/assets/gofreyra-logo.png";

async function handleOAuthSignIn(provider: "google" | "apple") {
  const result = await lovable.auth.signInWithOAuth(provider, {
    redirect_uri: window.location.origin,
  });
  if (result.error) {
    console.error(`${provider} sign-in failed`, result.error);
    return;
  }
  if (result.redirected) return;
  window.location.href = "/select";
}

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Log ind — GoFreyra" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(DEMO_USERS[0].id);
  const [password, setPassword] = useState("demo1234");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = DEMO_USERS.find((x) => x.id === selected)!;
    login(u);
    navigate({ to: "/select" });
  };

  const stats = [
    { k: "120+", v: "Datakilder" },
    { k: "Metodeklar", v: "Biodiversitet med kontekst" },
    { k: "Rapportklar", v: "Til kommune, fond og ESG" },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left hero — dark green */}
      <div className="hidden lg:flex relative overflow-hidden bg-sidebar text-sidebar-foreground p-12 flex-col justify-between">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              "radial-gradient(900px 600px at 20% 30%, oklch(0.45 0.15 150 / 0.6), transparent 60%), radial-gradient(700px 500px at 80% 90%, oklch(0.55 0.18 145 / 0.4), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <img
            src={logoMark}
            alt="GoFreyra"
            className="h-11 w-11 object-contain"
          />
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
              <div
                key={x.v}
                className="rounded-xl bg-sidebar-accent/60 p-4 border border-sidebar-border"
              >
                <div className="text-xl font-semibold text-leaf leading-tight">
                  {x.k}
                </div>
                <div className="text-xs text-sidebar-muted mt-1 leading-snug">
                  {x.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Freyra ApS · Platform for verificeret naturkapital
        </div>
      </div>

      {/* Right — login card */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <img src={logoMark} alt="GoFreyra" className="h-9 w-9 object-contain" />
            <span className="font-semibold">GoFreyra</span>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Velkommen tilbage</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Log ind for at fortsætte til dit GoFreyra workspace.
            </p>
          </div>

          {/* Demo user selector — compact */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Demo-adgang
              </label>
              <span className="text-[10px] text-muted-foreground">Vælg bruger</span>
            </div>
            <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
              {DEMO_USERS.map((u) => (
                <label
                  key={u.id}
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${
                    selected === u.id ? "bg-accent/40" : "hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="user"
                    value={u.id}
                    checked={selected === u.id}
                    onChange={() => setSelected(u.id)}
                    className="sr-only"
                  />
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold">
                    {u.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.role}
                    </div>
                  </div>
                  {selected === u.id && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Password */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Adgangskode</label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Demo-adgang — enhver adgangskode virker.
            </p>
          </div>

          {/* Primary login — single button */}
          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition"
          >
            Log ind
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-background px-2 text-muted-foreground">eller</span>
            </div>
          </div>

          {/* Secondary OAuth */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleOAuthSignIn("google")}
              className="w-full rounded-xl border border-input bg-card py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"/>
              </svg>
              Fortsæt med Google
            </button>

            <button
              type="button"
              onClick={() => handleOAuthSignIn("apple")}
              className="w-full rounded-xl border border-input bg-card py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition flex items-center justify-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Fortsæt med Apple
            </button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-2">
            Brug for hjælp?{" "}
            <a className="text-primary hover:underline" href="#">
              Kontakt support
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
