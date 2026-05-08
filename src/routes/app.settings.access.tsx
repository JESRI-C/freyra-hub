import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card } from "@/components/ui-bits";
import { Section, PermissionCell } from "@/components/settings/Primitives";
import { ROLES, PERMISSIONS, ROLE_MATRIX } from "@/lib/settings-data";
import { ShieldCheck, Save, Info, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/app/settings/access")({
  head: () => ({ meta: [{ title: "Adgang & rettigheder — GoFreyra" }] }),
  component: AccessPage,
});

const GROUPS = [
  { name: "Generelt", perms: ["Se dashboard", "Se audit trail"] },
  { name: "Data", perms: ["Tilføj datakilder", "Validér data", "Redigér projekter"] },
  { name: "AI & rapporter", perms: ["Brug DecisionsIQ", "Eksportér rapporter", "Godkend rapporter"] },
  { name: "Administration", perms: ["Administrér brugere", "Administrér abonnement", "API-adgang"] },
];

function AccessPage() {
  const [matrix, setMatrix] = useState(ROLE_MATRIX);
  const [activeRole, setActiveRole] = useState<string>(ROLES[1]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const cycle = (role: string, perm: string) => {
    setMatrix((m) => {
      const cur = m[role][perm];
      const next = cur === "full" ? "limited" : cur === "limited" ? "none" : "full";
      return { ...m, [role]: { ...m[role], [perm]: next } };
    });
  };

  return (
    <main className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-leaf/30 text-primary"><ShieldCheck className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-semibold">Adgang & rettigheder</h1><p className="text-xs text-muted-foreground">Definér hvad hver rolle kan se og gøre</p></div>
        </div>
        <button onClick={() => setSavedAt(Date.now())} className="rounded-xl bg-primary text-primary-foreground px-4 py-2 text-sm inline-flex items-center gap-2"><Save className="h-4 w-4" /> Gem rolledefinition</button>
      </div>

      <div className="rounded-xl border bg-leaf/5 p-3 text-xs flex gap-2 items-start">
        <Info className="h-4 w-4 text-primary mt-0.5" />
        <div>Klik på en celle for at skifte mellem <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-success" /> fuld</span>, <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-warning" /> begrænset</span> og <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted-foreground/40" /> ingen</span> adgang.</div>
      </div>

      <Card className="overflow-hidden">
        <div className="p-4 border-b text-sm font-semibold">Rettigheds-matrix</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-4 py-2.5 sticky left-0 bg-muted/40 z-10 min-w-[200px]">Rolle</th>
                {PERMISSIONS.map((p) => <th key={p} className="font-medium px-2 py-2.5 text-[11px] text-center whitespace-nowrap">{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {ROLES.map((role) => (
                <tr key={role} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2.5 sticky left-0 bg-card font-medium z-10">{role}</td>
                  {PERMISSIONS.map((p) => (
                    <td key={p} className="px-2 py-2.5 text-center">
                      <button onClick={() => cycle(role, p)} className="hover:scale-110 transition" title={`${role} – ${p}`}>
                        <PermissionCell level={matrix[role][p]} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Roller" subtitle="Vælg en rolle for at se grupperede tilladelser">
          <div className="space-y-1">
            {ROLES.map((r) => (
              <button key={r} onClick={() => setActiveRole(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${activeRole === r ? "bg-leaf/30 text-foreground font-medium" : "hover:bg-muted"}`}>
                {r}
              </button>
            ))}
          </div>
        </Section>

        <Section title={`Tilladelser for ${activeRole}`} subtitle="Grupperet visning" className="lg:col-span-2">
          <div className="space-y-4">
            {GROUPS.map((g) => (
              <div key={g.name}>
                <div className="text-xs font-semibold uppercase text-muted-foreground tracking-wide mb-2">{g.name}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {g.perms.map((p) => (
                    <div key={p} className="flex items-center justify-between px-3 py-2 rounded-lg border">
                      <span className="text-sm">{p}</span>
                      <PermissionCell level={matrix[activeRole][p]} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {savedAt && (
        <div className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 bg-success text-white text-sm px-4 py-2.5 rounded-xl shadow-lg">
          <CheckCircle2 className="h-4 w-4" /> Rolledefinition gemt
        </div>
      )}
    </main>
  );
}
