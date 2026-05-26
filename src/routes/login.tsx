import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Leaf, Lock } from "lucide-react";
import { DEMO_USERS, useAuth } from "@/lib/auth";
import { lovable } from "@/integrations/lovable";

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
          <div className="h-10 w-10 rounded-xl bg-leaf/90 grid place-items-center text-leaf-foreground">
            <Leaf className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">GoFreyra</div>
            <div className="text-xs text-sidebar-muted">Platform for verificeret naturkapital</div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight">
            Mål, dokumentér og handl på <span className="text-leaf">verificeret impact</span>.
          </h1>
          <p className="text-sidebar-muted">
            Forbind data, beslutninger og rapportering i én platform — bygget til ansvarlige
            organisationer i Norden.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              { k: "120+", v: "Datakilder" },
              { k: "98%", v: "Verificeret" },
              { k: "ESG", v: "Klar rapport" },
            ].map((x) => (
              <div
                key={x.v}
                className="rounded-xl bg-sidebar-accent/60 p-4 border border-sidebar-border"
              >
                <div className="text-2xl font-semibold text-leaf">{x.k}</div>
                <div className="text-xs text-sidebar-muted mt-1">{x.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Freyra ApS
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <form onSubmit={handleSubmit} className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center gap-2 mb-2">
            <div className="h-9 w-9 rounded-xl bg-primary grid place-items-center text-primary-foreground">
              <Leaf className="h-5 w-5" />
            </div>
            <span className="font-semibold">GoFreyra</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Velkommen tilbage</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Log ind for at fortsætte til din arbejdsplads.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium">Vælg demo-bruger</label>
            <div className="grid gap-2">
              {DEMO_USERS.map((u) => (
                <label
                  key={u.id}
                  className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition ${
                    selected === u.id
                      ? "border-primary bg-accent/40 shadow-soft"
                      : "border-border hover:bg-muted/40"
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
                  <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
                    {u.initials}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {u.role} · {u.email}
                    </div>
                  </div>
                  {selected === u.id && <span className="h-2 w-2 rounded-full bg-primary" />}
                </label>
              ))}
            </div>
          </div>

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

          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition"
          >
            Log ind
          </button>

          <button
            type="submit"
            className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium shadow-soft hover:opacity-95 transition"
          >
            Log ind
          </button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">eller</span></div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full rounded-xl border border-input bg-card py-2.5 text-sm font-medium hover:bg-muted/40 transition flex items-center justify-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C41 35 44 30 44 24c0-1.3-.1-2.3-.4-3.5z"/>
            </svg>
            Fortsæt med Google
          </button>

          <div className="text-xs text-muted-foreground text-center">
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
