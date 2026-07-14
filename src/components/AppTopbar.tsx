import { useState } from "react";
import { Bell, Calendar, HelpCircle, LogOut, Search, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

const RANGES = ["I dag", "Sidste 7 dage", "Sidste 30 dage", "Dette kvartal", "Året til dato"];

export function AppTopbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [range, setRange] = useState("Sidste 30 dage");
  const [openRange, setOpenRange] = useState(false);
  const [openUser, setOpenUser] = useState(false);

  return (
    <header className="sticky top-0 z-20 bg-background/85 backdrop-blur border-b">
      <div className="flex items-center gap-3 px-3 sm:px-6 py-3 min-w-0">
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="hidden sm:block text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>

        <div className="hidden md:flex items-center gap-2 ml-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Søg i projekt, datasæt, rapporter…"
              className="w-full rounded-xl border border-input bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative hidden sm:block">
            <button
              onClick={() => setOpenRange((v) => !v)}
              className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-sm hover:bg-muted transition"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {range}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {openRange && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-popover shadow-card p-1 z-30">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => {
                      setRange(r);
                      setOpenRange(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted ${r === range ? "text-primary font-medium" : ""}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            className="relative h-9 w-9 grid place-items-center rounded-xl border bg-card hover:bg-muted transition"
            title="Notifikationer"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
          </button>
          <button
            className="h-9 w-9 grid place-items-center rounded-xl border bg-card hover:bg-muted transition"
            title="Hjælp"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setOpenUser((v) => !v)}
              className="flex items-center gap-2 rounded-xl border bg-card pl-1 pr-3 py-1 hover:bg-muted transition"
            >
              <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-semibold">
                {user?.initials}
              </span>
              <span className="hidden sm:block text-sm font-medium">
                {user?.name.split(" ")[0]}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {openUser && (
              <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-popover shadow-card p-2 z-30">
                <div className="px-2 py-2">
                  <div className="text-sm font-medium">{user?.name}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => navigate({ to: "/select" })}
                  className="w-full text-left px-2 py-2 rounded-lg text-sm hover:bg-muted"
                >
                  Skift arbejdsplads
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate({ to: "/login" });
                  }}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm hover:bg-muted text-destructive"
                >
                  <LogOut className="h-4 w-4" /> Log ud
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
