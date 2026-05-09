import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, StatCard } from "@/components/ui-bits";
import { Section, Drawer, StatusPill, Toggle } from "@/components/settings/Primitives";
import { USERS, ROLES, type AdminUser } from "@/lib/settings-data";
import { Users, UserPlus, Search, Mail, ShieldCheck, Clock, KeyRound, X } from "lucide-react";

export const Route = createFileRoute("/app/settings/users")({
  head: () => ({ meta: [{ title: "Brugere & roller — GoFreyra" }] }),
  component: UsersPage,
});

function UsersPage() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const open = openId ? USERS.find((u) => u.id === openId) : null;
  const filtered = useMemo(
    () => USERS.filter((u) => (u.name + u.email + u.role).toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = {};
    USERS.forEach((u) => {
      c[u.role] = (c[u.role] ?? 0) + 1;
    });
    return c;
  }, []);

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Brugere & roller</h1>
            <p className="text-xs text-muted-foreground">
              Administrér teammedlemmer og adgangsroller
            </p>
          </div>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2"
        >
          <UserPlus className="h-4 w-4" /> Inviter bruger
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Brugere"
          value={String(USERS.length)}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Aktive"
          value={String(USERS.filter((u) => u.status === "Aktiv").length)}
          icon={<Users className="h-5 w-5" />}
          accent="bg-success/15 text-success"
        />
        <StatCard
          label="Afventer invitation"
          value={String(USERS.filter((u) => u.status === "Inviteret").length)}
          icon={<Mail className="h-5 w-5" />}
          accent="bg-warning/20 text-warning-foreground"
        />
        <StatCard
          label="2FA aktiveret"
          value={`${USERS.filter((u) => u.mfa).length} / ${USERS.length}`}
          icon={<ShieldCheck className="h-5 w-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b gap-3">
            <div className="text-sm font-semibold">Teammedlemmer</div>
            <div className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 w-72 max-w-full">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Søg navn, email, rolle..."
                className="bg-transparent outline-none text-sm flex-1 min-w-0"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  {[
                    "Navn",
                    "Rolle",
                    "Organisation",
                    "Projekter",
                    "Status",
                    "2FA",
                    "Senest login",
                  ].map((h) => (
                    <th key={h} className="text-left font-medium px-4 py-2.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => setOpenId(u.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-leaf/30 text-primary grid place-items-center text-xs font-semibold">
                          {u.initials}
                        </div>
                        <div>
                          <div className="font-medium">{u.name}</div>
                          <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{u.role}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{u.org}</td>
                    <td className="px-4 py-3 tabular-nums">{u.projects}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      {u.mfa ? (
                        <span className="text-xs text-success inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Aktiv
                        </span>
                      ) : (
                        <span className="text-xs text-warning-foreground inline-flex items-center gap-1">
                          <X className="h-3 w-3" /> Mangler
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {u.lastLogin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Section title="Rollefordeling" subtitle="Antal brugere pr. rolle">
            <div className="space-y-2">
              {ROLES.map((r) => {
                const n = roleCounts[r] ?? 0;
                const pct = (n / USERS.length) * 100;
                return (
                  <div key={r}>
                    <div className="flex items-center justify-between text-xs">
                      <span>{r}</span>
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Afventende invitationer" subtitle="Sendte men ikke accepterede">
            <div className="space-y-2">
              {USERS.filter((u) => u.status === "Inviteret").map((u) => (
                <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg border">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{u.email}</div>
                    <div className="text-[11px] text-muted-foreground">Rolle: {u.role}</div>
                  </div>
                  <button className="text-xs rounded-lg border bg-card px-2 py-1">Send igen</button>
                </div>
              ))}
              {USERS.filter((u) => u.status === "Inviteret").length === 0 && (
                <p className="text-xs text-muted-foreground">Ingen afventende.</p>
              )}
            </div>
          </Section>
        </div>
      </div>

      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ""}
        subtitle={open?.email}
        width="max-w-xl"
        footer={
          <>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">Skift rolle</button>
            <button className="rounded-lg border bg-card px-3 py-1.5 text-sm">
              Nulstil adgang
            </button>
            <button className="ml-auto rounded-lg border border-destructive/30 text-destructive bg-card px-3 py-1.5 text-sm">
              Deaktivér bruger
            </button>
          </>
        }
      >
        {open && <UserDetail u={open} />}
      </Drawer>

      <Drawer
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Inviter bruger"
        subtitle="Send invitation via e-mail"
        footer={
          <>
            <button
              onClick={() => setInviteOpen(false)}
              className="rounded-lg border bg-card px-3 py-1.5 text-sm"
            >
              Annullér
            </button>
            <button
              onClick={() => setInviteOpen(false)}
              className="ml-auto rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm"
            >
              Send invitation
            </button>
          </>
        }
      >
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">E-mail</div>
          <input
            className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
            placeholder="navn@eksempel.dk"
          />
        </label>
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Rolle</div>
          <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
            {ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <div className="text-xs text-muted-foreground mb-1">Projektadgang</div>
          <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm">
            <option>Alle projekter</option>
            <option>Kun udvalgte projekter</option>
          </select>
        </label>
        <div className="rounded-xl border p-3 bg-leaf/5 text-xs">
          Brugeren modtager en e-mail med login-link og opfordres til at aktivere 2FA.
        </div>
      </Drawer>
    </main>
  );
}

function UserDetail({ u }: { u: AdminUser }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 rounded-2xl bg-leaf/30 text-primary grid place-items-center text-lg font-semibold">
          {u.initials}
        </div>
        <div>
          <div className="text-base font-semibold">{u.name}</div>
          <div className="text-xs text-muted-foreground">
            {u.role} · {u.org}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-muted-foreground">Status</div>
          <div className="mt-1">
            <StatusPill status={u.status} />
          </div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-muted-foreground">Senest login</div>
          <div className="mt-1 text-sm">{u.lastLogin}</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-muted-foreground">Projektadgang</div>
          <div className="mt-1 text-sm">{u.projects} projekter</div>
        </div>
        <div className="rounded-xl border p-3">
          <div className="text-[11px] text-muted-foreground">2FA</div>
          <div className="mt-1">
            <Toggle checked={u.mfa} />
          </div>
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
          Modul-adgang
        </div>
        <div className="flex flex-wrap gap-2">
          {["DecisionsIQ", "Impact Exchange", "ESG Ledger", "Smart Connect", "Reports"].map((m) => (
            <span
              key={m}
              className="text-xs px-2 py-1 rounded-full bg-leaf/20 border border-primary/20"
            >
              {m}
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">
          Aktivitet
        </div>
        <ol className="space-y-1.5">
          {[
            { t: "Loggede ind", w: u.lastLogin },
            { t: "Eksporterede rapport RPT-2041", w: "I går" },
            { t: "Ændrede adgang for Lars Olsen", w: "2 dage" },
            { t: "Tilføjede datakilde Skallebæk-Zone-C", w: "1 uge" },
          ].map((a, i) => (
            <li key={i} className="flex items-center gap-2 text-xs">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="flex-1">{a.t}</span>
              <span className="text-muted-foreground">{a.w}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="rounded-xl border bg-warning/5 p-3 text-xs flex gap-2">
        <KeyRound className="h-4 w-4 text-warning-foreground mt-0.5" />
        <span>API-nøgler tilknyttet denne bruger nulstilles ved deaktivering.</span>
      </div>
    </>
  );
}
