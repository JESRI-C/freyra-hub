import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { getWorkCustomers } from "@/lib/work-customers.functions";
import {
  CustomerDetailSchema,
  CustomerCaseListSchema,
  CustomerListSchema,
  emptyCustomer,
  emptyCustomerContact,
  type CustomerDetail,
  type CustomerFields,
} from "@/lib/work-customers";
import { useCustomerCommand } from "./useCustomerCommand";
import { CustomerField as Field } from "./CustomerField";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const primary = `${button} bg-primary text-primary-foreground hover:bg-primary/90`;
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const panel = "min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5";
type Contact = CustomerDetail["contacts"][number];
type Editor =
  | { kind: "customer"; customer: CustomerDetail["customer"] | null }
  | { kind: "contact"; contact: Contact | null; detail: CustomerDetail }
  | { kind: "case"; detail: CustomerDetail }
  | { kind: "planner"; detail: CustomerDetail };
type FormProps = {
  organizationId: string;
  actorId: string;
  onClose: () => void;
  onSaved: (id: string) => void;
};

export function CustomerWorkspace() {
  const { user, orgId, loading, authError } = useAuth();
  if (loading) return <p role="status">Kontrollerer adgang…</p>;
  if (authError)
    return <p role="alert">Din adgang kunne ikke kontrolleres. Prøv at genindlæse siden.</p>;
  if (!user || !orgId) return <p>Log ind og vælg en organisation for at åbne kunder.</p>;
  return <Customers key={`${user.id}:${orgId}`} organizationId={orgId} actorId={user.id} />;
}

function Customers({ organizationId, actorId }: { organizationId: string; actorId: string }) {
  const load = useServerFn(getWorkCustomers);
  const cache = useQueryClient();
  const { refresh } = useAuth();
  const [filters, setFilters] = useState({ search: "", includeArchived: false, offset: 0 });
  const [selected, setSelected] = useState<string>();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [createdCase, setCreatedCase] = useState<string>();
  const locked = editor !== null;
  useBlocker({ shouldBlockFn: () => locked, enableBeforeUnload: locked });
  const list = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "list", filters],
    queryFn: async () =>
      CustomerListSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "list",
            ...filters,
          },
        }),
      ),
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const detail = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "customer", selected],
    queryFn: async () =>
      CustomerDetailSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "customer",
            customerId: selected!,
          },
        }),
      ),
    enabled: !!selected,
    retry: false,
    refetchOnWindowFocus: !locked,
    refetchOnReconnect: !locked,
  });
  const current =
    !detail.isError && detail.data?.customer.id === selected ? detail.data : undefined;
  const canManage = !list.isError && list.data?.canManage === true;
  function saved(id: string) {
    if (editor?.kind === "customer") setSelected(id);
    if (editor?.kind === "case") {
      setCreatedCase(id);
      void refresh().catch(() => undefined);
    }
    setEditor(null);
    void cache.invalidateQueries({ queryKey: ["work-customers", actorId, organizationId] });
  }
  const form = {
    organizationId,
    actorId,
    onClose: () => {
      setEditor(null);
      void list.refetch();
      if (selected) void detail.refetch();
    },
    onSaved: saved,
  };
  return (
    <section aria-label="Kunder og sager" className="space-y-5 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium">
          Søg kunder
          <input
            className={control}
            type="search"
            maxLength={120}
            value={filters.search}
            disabled={locked}
            onChange={(e) => setFilters({ ...filters, search: e.target.value, offset: 0 })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeArchived}
            disabled={locked}
            onChange={(e) =>
              setFilters({ ...filters, includeArchived: e.target.checked, offset: 0 })
            }
          />
          Vis arkiverede
        </label>
        {canManage && (
          <button
            type="button"
            className={primary}
            disabled={locked}
            onClick={() => setEditor({ kind: "customer", customer: null })}
          >
            Opret kunde
          </button>
        )}
      </div>
      {createdCase && (
        <div role="status" className={panel}>
          <p>Sagen er oprettet. Tilføj og planlæg dens jobs i arbejdsrummet.</p>
          <Link
            className={primary}
            to="/app/projects/$slug"
            params={{ slug: createdCase }}
            search={{ tab: "handlinger" }}
          >
            Åbn den nye sag
          </Link>
        </div>
      )}
      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(240px,1fr)_minmax(0,2fr)]">
        <aside className={panel} aria-label="Kundeliste">
          {list.isPending && <p role="status">Henter kunder…</p>}
          {list.isError ? (
            <div role="alert">
              <p>Kunderne kunne ikke hentes. Kontrollér forbindelsen og din adgang.</p>
              <button className={button} disabled={locked} onClick={() => void list.refetch()}>
                Prøv igen
              </button>
            </div>
          ) : (
            list.data && (
              <>
                {!list.data.rows.length && (
                  <p className="text-sm text-muted-foreground">
                    Ingen kunder i denne visning. Du ser kun kunder, du har adgang til at planlægge.
                  </p>
                )}
                <ul className="space-y-2">
                  {list.data.rows.map((customer) => (
                    <li key={customer.id}>
                      <button
                        type="button"
                        disabled={locked}
                        aria-pressed={selected === customer.id}
                        className={`${button} w-full flex-col items-start text-left ${selected === customer.id ? "border-primary bg-primary/5" : ""}`}
                        onClick={() => {
                          setSelected(customer.id);
                          setCreatedCase(undefined);
                        }}
                      >
                        <span className="font-semibold">{customer.data.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {customer.number}
                          {customer.data.archived ? " · Arkiveret" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap justify-between gap-2">
                  <button
                    className={button}
                    disabled={locked || filters.offset === 0}
                    onClick={() =>
                      setFilters({ ...filters, offset: Math.max(0, filters.offset - 50) })
                    }
                  >
                    Forrige
                  </button>
                  <button
                    className={button}
                    disabled={locked || !list.data.hasMore || filters.offset >= 100000}
                    onClick={() => setFilters({ ...filters, offset: filters.offset + 50 })}
                  >
                    Næste
                  </button>
                </div>
              </>
            )
          )}
        </aside>
        <div className="min-w-0 space-y-5">
          {editor?.kind === "customer" && <CustomerForm {...form} customer={editor.customer} />}
          {editor?.kind === "contact" && (
            <ContactForm {...form} detail={editor.detail} contact={editor.contact} />
          )}
          {editor?.kind === "case" && <CaseForm {...form} detail={editor.detail} />}
          {editor?.kind === "planner" && <PlannerForm {...form} detail={editor.detail} />}
          {!editor && selected && detail.isPending && (
            <p role="status">Henter kundens oplysninger…</p>
          )}
          {!editor && selected && detail.isError && (
            <div role="alert" className={panel}>
              <p>Kunden kunne ikke åbnes. Du kan have mistet adgangen.</p>
              <button className={button} onClick={() => void detail.refetch()}>
                Hent igen
              </button>
            </div>
          )}
          {!editor && current && (
            <>
              <section className={panel} aria-label="Kundeoplysninger">
                <header className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {current.customer.number} · Version {current.customer.version}
                    </p>
                    <h2 className="text-xl font-semibold">{current.customer.data.name}</h2>
                    {current.customer.data.archived && (
                      <p className="mt-1 text-sm font-medium">Arkiveret kunde</p>
                    )}
                  </div>
                  {current.canManage && (
                    <button
                      className={button}
                      onClick={() => setEditor({ kind: "customer", customer: current.customer })}
                    >
                      Redigér kunde
                    </button>
                  )}
                </header>
                <p className="whitespace-pre-line text-sm">
                  {[
                    current.customer.data.address,
                    [current.customer.data.postalCode, current.customer.data.city]
                      .filter(Boolean)
                      .join(" "),
                    current.customer.data.country,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                </p>
                {current.customer.data.registrationNumber && (
                  <p className="text-sm">
                    CVR / registrering: {current.customer.data.registrationNumber}
                  </p>
                )}
                {!current.customer.data.archived && (
                  <button
                    className={primary}
                    onClick={() => setEditor({ kind: "case", detail: current })}
                  >
                    Opret sag under kunden
                  </button>
                )}
              </section>
              <CustomerCases
                key={current.customer.id}
                organizationId={organizationId}
                actorId={actorId}
                customerId={current.customer.id}
              />
              <section className={panel} aria-label="Kontaktpersoner">
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Kontaktpersoner</h2>
                  {current.canManage && !current.customer.data.archived && (
                    <button
                      className={button}
                      onClick={() => setEditor({ kind: "contact", contact: null, detail: current })}
                    >
                      Tilføj kontaktperson
                    </button>
                  )}
                </header>
                {!current.contacts.length && (
                  <p className="text-sm text-muted-foreground">Ingen kontaktpersoner endnu.</p>
                )}
                <ul className="divide-y">
                  {current.contacts.map((contact) => (
                    <li
                      key={contact.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">
                          {contact.data.name}
                          {contact.data.archived ? " · Arkiveret" : ""}
                        </p>
                        <p className="text-sm text-muted-foreground">{contact.data.title}</p>
                        <p className="text-sm">
                          {[contact.data.phone, contact.data.email].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {current.canManage && (
                        <button
                          className={button}
                          onClick={() => setEditor({ kind: "contact", contact, detail: current })}
                        >
                          Redigér kontakt
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              {current.canManage && (
                <section className={panel} aria-label="Planlægningsadgang">
                  <h2 className="text-lg font-semibold">Planlægningsadgang</h2>
                  <p className="text-sm text-muted-foreground">
                    Giv en kollega adgang til at se kunden og oprette sager. Adgang til de enkelte
                    sager styres særskilt.
                  </p>
                  <ul className="space-y-1 text-sm">
                    {current.planners
                      .filter((p) => p.enabled)
                      .map((p) => (
                        <li key={p.userId}>
                          {current.availableUsers.find((u) => u.userId === p.userId)?.name ??
                            "Tidligere medlem"}
                        </li>
                      ))}
                  </ul>
                  <button
                    className={button}
                    onClick={() => setEditor({ kind: "planner", detail: current })}
                  >
                    Administrér planlæggere
                  </button>
                </section>
              )}
              <section className={panel} aria-label="Kundehistorik">
                <h2 className="text-lg font-semibold">Seneste kundehistorik</h2>
                <p className="text-sm text-muted-foreground">
                  Sager bevarer den valgte kunde- og kontaktversion, når registret rettes.
                </p>
                <ol className="space-y-2 text-sm">
                  {current.history.map((item) => (
                    <li key={item.version}>
                      Version {item.version} · {item.data.name}
                      {item.data.archived ? " · Arkiveret" : ""}
                      <br />
                      <time className="text-muted-foreground" dateTime={item.changedAt}>
                        {new Date(item.changedAt).toLocaleString("da-DK")}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )}
          {!editor && !selected && (
            <p className="p-4 text-sm text-muted-foreground">
              Vælg en kunde for at se kontaktpersoner og oprette en sag.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CustomerCases({
  organizationId,
  actorId,
  customerId,
}: {
  organizationId: string;
  actorId: string;
  customerId: string;
}) {
  const load = useServerFn(getWorkCustomers);
  const [offset, setOffset] = useState(0);
  const cases = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "cases", customerId, offset],
    queryFn: async () =>
      CustomerCaseListSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "cases",
            customerId,
            offset,
          },
        }),
      ),
    retry: false,
  });
  return (
    <section className={panel} aria-label="Kundens sager">
      <h2 className="text-lg font-semibold">Sager</h2>
      {cases.isPending && <p role="status">Henter sager…</p>}
      {cases.isError ? (
        <div role="alert" className="text-sm">
          <p>Sagerne kunne ikke hentes.</p>
          <button className={button} onClick={() => void cases.refetch()}>
            Hent sager igen
          </button>
        </div>
      ) : (
        cases.data && (
          <>
            {!cases.data.rows.length && (
              <p className="text-sm text-muted-foreground">
                Ingen sager i denne visning. Du ser kun sager, du har adgang til.
              </p>
            )}
            <ul className="divide-y">
              {cases.data.rows.map((item) => (
                <li
                  key={item.projectId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {item.number} · {item.title}
                    </p>
                    {item.customerReference && (
                      <p className="text-sm text-muted-foreground">{item.customerReference}</p>
                    )}
                  </div>
                  <Link
                    className={button}
                    to="/app/projects/$slug"
                    params={{ slug: item.projectId }}
                    search={{ tab: "handlinger" }}
                  >
                    Åbn jobs
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                className={button}
                disabled={!offset}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Forrige sager
              </button>
              <button
                className={button}
                disabled={!cases.data.hasMore || offset >= 100000}
                onClick={() => setOffset(offset + 50)}
              >
                Næste sager
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}

function Actions({
  command,
  onClose,
  label,
}: {
  command: ReturnType<typeof useCustomerCommand>;
  onClose: () => void;
  label: string;
}) {
  return (
    <>
      {command.error && (
        <p role="alert" className="text-sm text-destructive">
          {command.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primary} disabled={command.busy}>
          {command.busy ? "Gemmer…" : command.uncertain ? "Prøv samme gemning igen" : label}
        </button>
        <button type="button" className={button} disabled={command.locked} onClick={onClose}>
          Fortryd
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Gem eller luk udkastet, før du forlader visningen.
      </p>
    </>
  );
}
function CustomerForm({
  customer,
  ...props
}: FormProps & { customer: CustomerDetail["customer"] | null }) {
  const [data, setData] = useState<CustomerFields>(() => ({
    ...(customer?.data ?? emptyCustomer),
  }));
  const command = useCustomerCommand(props.organizationId, props.actorId, (r) =>
    props.onSaved(r.id),
  );
  const fields = [
    ["name", "Kundenavn", 240],
    ["registrationNumber", "CVR / registreringsnummer", 40],
    ["address", "Adresse", 500],
    ["postalCode", "Postnummer", 30],
    ["city", "By", 160],
    ["country", "Land", 80],
  ] as const;
  return (
    <form
      className={panel}
      aria-label={customer ? "Redigér kunde" : "Opret kunde"}
      onSubmit={(e) => {
        e.preventDefault();
        void command.submit({
          operation: "save_customer",
          customerId: customer?.id ?? null,
          expectedVersion: customer?.version ?? 0,
          data,
        });
      }}
    >
      <h2 className="text-lg font-semibold">{customer ? "Redigér kunde" : "Opret kunde"}</h2>
      <fieldset disabled={command.locked} className="grid min-w-0 gap-3 sm:grid-cols-2">
        {fields.map(([key, label, max]) => (
          <Field key={key} label={label}>
            <input
              className={control}
              value={data[key]}
              required={key === "name" || key === "country"}
              maxLength={max}
              onChange={(e) => setData({ ...data, [key]: e.target.value })}
            />
          </Field>
        ))}
      </fieldset>
      {customer && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.archived}
            disabled={command.locked}
            onChange={(e) => setData({ ...data, archived: e.target.checked })}
          />
          Arkivér kunde · tidligere sager bevares
        </label>
      )}
      <Actions command={command} onClose={props.onClose} label="Gem kunde" />
    </form>
  );
}
function ContactForm({
  detail,
  contact,
  ...props
}: FormProps & { detail: CustomerDetail; contact: Contact | null }) {
  const [data, setData] = useState(() => ({ ...(contact?.data ?? emptyCustomerContact) }));
  const command = useCustomerCommand(props.organizationId, props.actorId, (r) =>
    props.onSaved(r.id),
  );
  const fields = [
    ["name", "Kontaktens navn", 240, "text"],
    ["title", "Funktion", 160, "text"],
    ["email", "E-mail", 254, "email"],
    ["phone", "Telefon", 80, "tel"],
  ] as const;
  return (
    <form
      className={panel}
      aria-label="Kontaktperson"
      onSubmit={(e) => {
        e.preventDefault();
        void command.submit({
          operation: "save_contact",
          customerId: detail.customer.id,
          contactId: contact?.id ?? null,
          expectedVersion: contact?.version ?? 0,
          data,
        });
      }}
    >
      <h2 className="text-lg font-semibold">
        {contact ? "Redigér kontaktperson" : "Tilføj kontaktperson"}
      </h2>
      <fieldset disabled={command.locked} className="grid gap-3 sm:grid-cols-2">
        {fields.map(([key, label, max, type]) => (
          <Field key={key} label={label}>
            <input
              className={control}
              type={type}
              required={key === "name"}
              value={data[key]}
              maxLength={max}
              onChange={(e) => setData({ ...data, [key]: e.target.value })}
            />
          </Field>
        ))}
      </fieldset>
      {contact && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={command.locked}
            checked={data.archived}
            onChange={(e) => setData({ ...data, archived: e.target.checked })}
          />
          Arkivér kontakt · tidligere sager bevares
        </label>
      )}
      <Actions command={command} onClose={props.onClose} label="Gem kontaktperson" />
    </form>
  );
}
function CaseForm({ detail, ...props }: FormProps & { detail: CustomerDetail }) {
  const [data, setData] = useState({
    title: "",
    description: "",
    location: "",
    customerReference: "",
    contactId: "",
  });
  const command = useCustomerCommand(props.organizationId, props.actorId, (r) =>
    props.onSaved(r.id),
  );
  return (
    <form
      className={panel}
      aria-label="Opret sag"
      onSubmit={(e) => {
        e.preventDefault();
        void command.submit({
          ...data,
          operation: "create_case",
          customerId: detail.customer.id,
          contactId: data.contactId || null,
        });
      }}
    >
      <h2 className="text-lg font-semibold">Opret sag · {detail.customer.data.name}</h2>
      <fieldset disabled={command.locked} className="space-y-3">
        <Field label="Sagens navn">
          <input
            className={control}
            required
            maxLength={240}
            value={data.title}
            onChange={(e) => setData({ ...data, title: e.target.value })}
          />
        </Field>
        <Field label="Sted">
          <input
            className={control}
            maxLength={500}
            value={data.location}
            onChange={(e) => setData({ ...data, location: e.target.value })}
          />
        </Field>
        <Field label="Beskrivelse">
          <textarea
            className={control}
            rows={3}
            maxLength={4000}
            value={data.description}
            onChange={(e) => setData({ ...data, description: e.target.value })}
          />
        </Field>
        <Field label="Kundens reference">
          <input
            className={control}
            maxLength={240}
            value={data.customerReference}
            onChange={(e) => setData({ ...data, customerReference: e.target.value })}
          />
        </Field>
        <Field label="Kontaktperson på sagen">
          <select
            aria-label="Kontaktperson på sagen"
            className={control}
            value={data.contactId}
            onChange={(e) => setData({ ...data, contactId: e.target.value })}
          >
            <option value="">Ingen kontakt valgt</option>
            {detail.contacts
              .filter((c) => !c.data.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.name}
                  {c.data.title ? ` · ${c.data.title}` : ""}
                </option>
              ))}
          </select>
        </Field>
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Du kan tilføje flere jobs, fordele arbejdet og vælge steder, når sagen er oprettet.
      </p>
      <Actions command={command} onClose={props.onClose} label="Opret sag" />
    </form>
  );
}
function PlannerForm({ detail, ...props }: FormProps & { detail: CustomerDetail }) {
  const [userId, setUserId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const command = useCustomerCommand(props.organizationId, props.actorId, (r) =>
    props.onSaved(r.id),
  );
  const prior = detail.planners.find((p) => p.userId === userId);
  return (
    <form
      className={panel}
      aria-label="Administrér planlæggere"
      onSubmit={(e) => {
        e.preventDefault();
        void command.submit({
          operation: "grant_planner",
          customerId: detail.customer.id,
          userId,
          enabled,
          expectedVersion: prior?.version ?? 0,
        });
      }}
    >
      <h2 className="text-lg font-semibold">Planlægningsadgang til {detail.customer.data.name}</h2>
      <fieldset disabled={command.locked} className="space-y-3">
        <Field label="Kollega">
          <select
            aria-label="Kollega"
            className={control}
            required
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setEnabled(detail.planners.find((p) => p.userId === e.target.value)?.enabled ?? true);
            }}
          >
            <option value="">Vælg en kollega</option>
            {detail.availableUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Må se kunden og oprette sager
        </label>
      </fieldset>
      <Actions command={command} onClose={props.onClose} label="Gem adgang" />
    </form>
  );
}
