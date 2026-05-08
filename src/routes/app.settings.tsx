import { createFileRoute } from "@tanstack/react-router";
import { AppTopbar } from "@/components/AppTopbar";
import { Card, CardHeader, PageHeader, Pill } from "@/components/ui-bits";
import { DEMO_USERS, useAuth, getCurrentOrg } from "@/lib/auth";

export const Route = createFileRoute("/app/settings")({
  head: () => ({ meta: [{ title: "Indstillinger — GoFreyra" }] }),
  component: Page,
});

function Page() {
  const { orgId, user } = useAuth();
  const org = getCurrentOrg(orgId);
  return (
    <>
      <AppTopbar title="Indstillinger" subtitle="Administrér organisation, team og platform" />
      <main className="p-6 max-w-[1400px] w-full mx-auto space-y-4">
        <PageHeader title="Indstillinger" description="Du er logget ind som administrator af din arbejdsplads." />

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader title="Organisation" subtitle="Grundlæggende information" />
            <div className="px-5 pb-5 grid sm:grid-cols-2 gap-4">
              <Field label="Navn" value={org?.name ?? ""} />
              <Field label="Beskrivelse" value={org?.description ?? ""} />
              <Field label="Region" value="Norden (EU-North-1)" />
              <Field label="Plan" value="Enterprise" />
            </div>
          </Card>
          <Card>
            <CardHeader title="Din konto" />
            <div className="px-5 pb-5 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary text-primary-foreground grid place-items-center font-semibold">{user?.initials}</div>
                <div>
                  <div className="font-medium">{user?.name}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">Rolle</div>
              <Pill tone="info">{user?.role}</Pill>
            </div>
          </Card>
        </div>

        <Card>
          <CardHeader title="Team" subtitle="Personer med adgang til denne organisation" action={<button className="text-sm rounded-lg bg-primary text-primary-foreground px-3 py-1.5">Inviter</button>} />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-y bg-muted/40">
              <tr><th className="px-5 py-2">Navn</th><th className="py-2">Email</th><th className="py-2">Rolle</th><th className="py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y">
              {DEMO_USERS.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-secondary text-secondary-foreground grid place-items-center text-xs font-semibold">{u.initials}</div>
                    {u.name}
                  </td>
                  <td className="text-muted-foreground">{u.email}</td>
                  <td>{u.role}</td>
                  <td><Pill tone="success">Aktiv</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader title="Sikkerhed" subtitle="Backend og verifikation" />
          <div className="px-5 pb-5 grid sm:grid-cols-3 gap-4 text-sm">
            <Field label="Backend" value="Mock (lokalt)" />
            <Field label="To-faktor" value="Anbefalet" />
            <Field label="Audit log" value="Aktiveret" />
          </div>
        </Card>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 rounded-xl border bg-background px-3 py-2 text-sm">{value}</div>
    </div>
  );
}
