import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkCustomers } from "@/lib/work-customers.functions";
import {
  CustomerContactsPageSchema,
  CustomerContactResultSchema,
  CustomerMembersPageSchema,
  CustomerHistoryPageSchema,
  type CustomerContact,
  type CustomerMember,
} from "@/lib/work-customers";
import { CustomerField } from "./CustomerField";

type Scope = { organizationId: string; actorId: string; customerId: string };
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
const panel = "min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5";

export function CustomerContactPicker(
  props: Scope & {
    value: string;
    onChange: (id: string) => void;
    onValidityChange: (valid: boolean) => void;
    disabled: boolean;
    label: string;
  },
) {
  return (
    <ContactPicker
      key={`${props.actorId}:${props.organizationId}:${props.customerId}`}
      {...props}
    />
  );
}
function ContactPicker({
  organizationId,
  actorId,
  customerId,
  value,
  onChange,
  onValidityChange,
  disabled,
  label,
}: Scope & {
  value: string;
  onChange: (id: string) => void;
  onValidityChange: (valid: boolean) => void;
  disabled: boolean;
  label: string;
}) {
  const load = useServerFn(getWorkCustomers);
  const [filter, setFilter] = useState({ search: "", offset: 0 });
  const page = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "contacts", customerId, false, filter],
    queryFn: async () =>
      CustomerContactsPageSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "contacts",
            customerId,
            includeArchived: false,
            ...filter,
          },
        }),
      ),
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  const selected = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "contact", customerId, value],
    queryFn: async () =>
      CustomerContactResultSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "contact",
            customerId,
            contactId: value,
          },
        }),
      ),
    enabled: !!value,
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  const contact =
    !selected.isError && selected.data?.contact.id === value ? selected.data.contact : undefined;
  const valid = !value || (!!contact && !contact.data.archived);
  useEffect(() => {
    onValidityChange(valid);
  }, [onValidityChange, valid]);
  const rows = page.isError ? [] : (page.data?.rows ?? []);
  return (
    <div className="min-w-0 space-y-2">
      <CustomerField label="Søg kontaktperson">
        <input
          className={control}
          type="search"
          maxLength={120}
          disabled={disabled}
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value, offset: 0 })}
        />
      </CustomerField>
      <CustomerField label={label}>
        <select
          className={control}
          aria-label={label}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Ingen kontakt valgt</option>
          {value && !rows.some((c) => c.id === value) && (
            <option value={value}>
              {contact
                ? `${contact.data.name}${contact.data.archived ? " · Arkiveret" : ""}`
                : "Valgt kontakt · kontrollerer adgang"}
            </option>
          )}
          {rows.map((c) => (
            <option key={c.id} value={c.id}>
              {c.data.name}
              {c.data.title ? ` · ${c.data.title}` : ""}
            </option>
          ))}
        </select>
      </CustomerField>
      {page.isPending && (
        <p role="status" className="text-sm">
          Henter kontaktpersoner…
        </p>
      )}
      {page.isError && (
        <p role="alert" className="text-sm">
          Kontaktlisten kunne ikke hentes.
        </p>
      )}
      {value && selected.isPending && (
        <p role="status" className="text-sm">
          Kontrollerer den valgte kontakt…
        </p>
      )}
      {value && selected.isError && (
        <p role="alert" className="text-sm">
          Den valgte kontakt kunne ikke kontrolleres.
        </p>
      )}
      {contact?.data.archived && (
        <p role="alert" className="text-sm">
          Kontakten er arkiveret. Vælg en aktiv kontakt eller fjern valget.
        </p>
      )}
      {(page.isError || selected.isError) && (
        <button
          type="button"
          className={button}
          disabled={disabled}
          onClick={() => {
            void page.refetch();
            if (value) void selected.refetch();
          }}
        >
          Hent kontakter igen
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || !filter.offset}
          onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - 50) })}
        >
          Forrige kontakter
        </button>
        <button
          type="button"
          className={button}
          disabled={disabled || page.isError || !page.data?.hasMore || filter.offset >= 100000}
          onClick={() => setFilter({ ...filter, offset: filter.offset + 50 })}
        >
          Næste kontakter
        </button>
      </div>
    </div>
  );
}

export function CustomerContacts({
  organizationId,
  actorId,
  customerId,
  canManage,
  archived,
  disabled,
  onAdd,
  onEdit,
}: Scope & {
  canManage: boolean;
  archived: boolean;
  disabled: boolean;
  onAdd: () => void;
  onEdit: (contact: CustomerContact) => void;
}) {
  const load = useServerFn(getWorkCustomers);
  const [filter, setFilter] = useState({ search: "", includeArchived: false, offset: 0 });
  const page = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "contacts-list", customerId, filter],
    queryFn: async () =>
      CustomerContactsPageSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "contacts",
            customerId,
            ...filter,
          },
        }),
      ),
    enabled: !disabled,
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  return (
    <section className={panel} aria-label="Kontaktpersoner">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Kontaktpersoner</h2>
        {canManage && !archived && (
          <button type="button" className={button} onClick={onAdd} disabled={disabled}>
            Tilføj kontaktperson
          </button>
        )}
      </header>
      <CustomerField label="Søg kontaktpersoner">
        <input
          className={control}
          type="search"
          maxLength={120}
          value={filter.search}
          disabled={disabled}
          onChange={(e) => setFilter({ ...filter, search: e.target.value, offset: 0 })}
        />
      </CustomerField>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={disabled}
          checked={filter.includeArchived}
          onChange={(e) => setFilter({ ...filter, includeArchived: e.target.checked, offset: 0 })}
        />
        Vis arkiverede kontakter
      </label>
      {page.isPending && <p role="status">Henter kontaktpersoner…</p>}
      {page.isError ? (
        <div role="alert">
          <p>Kontaktpersonerne kunne ikke hentes.</p>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => void page.refetch()}
          >
            Hent kontakter igen
          </button>
        </div>
      ) : (
        page.data && (
          <>
            {!page.data.rows.length && (
              <p className="text-sm text-muted-foreground">
                Ingen kontaktpersoner i denne visning.
              </p>
            )}
            <ul className="divide-y">
              {page.data.rows.map((contact) => (
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
                  {canManage && (
                    <button
                      type="button"
                      className={button}
                      disabled={disabled}
                      onClick={() => onEdit(contact)}
                    >
                      Redigér kontakt
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                disabled={disabled || !filter.offset}
                onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - 50) })}
              >
                Forrige kontaktpersoner
              </button>
              <button
                type="button"
                className={button}
                disabled={disabled || !page.data.hasMore || filter.offset >= 100000}
                onClick={() => setFilter({ ...filter, offset: filter.offset + 50 })}
              >
                Næste kontaktpersoner
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}

export function CustomerHistory({
  organizationId,
  actorId,
  customerId,
  disabled,
}: Scope & { disabled: boolean }) {
  const load = useServerFn(getWorkCustomers);
  const [cursors, setCursors] = useState<Array<number | null>>([null]);
  const beforeVersion = cursors[cursors.length - 1];
  const page = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "history", customerId, beforeVersion],
    queryFn: async () =>
      CustomerHistoryPageSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "history",
            customerId,
            beforeVersion,
          },
        }),
      ),
    enabled: !disabled,
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  return (
    <section className={panel} aria-label="Kundehistorik">
      <h2 className="text-lg font-semibold">Kundehistorik</h2>
      <p className="text-sm text-muted-foreground">
        Sager bevarer den valgte kunde- og kontaktversion, når registret rettes.
      </p>
      {page.isPending && <p role="status">Henter historik…</p>}
      {page.isError ? (
        <div role="alert">
          <p>Historikken kunne ikke hentes.</p>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => void page.refetch()}
          >
            Hent historik igen
          </button>
        </div>
      ) : (
        page.data && (
          <>
            <ol className="space-y-3 text-sm">
              {page.data.rows.map((item) => (
                <li key={item.version}>
                  <p className="font-medium">
                    Version {item.version} · {item.data.name}
                    {item.data.archived ? " · Arkiveret" : ""}
                  </p>
                  <time className="text-muted-foreground" dateTime={item.changedAt}>
                    {new Date(item.changedAt).toLocaleString("da-DK")}
                  </time>
                  <p className="whitespace-pre-line">
                    {[
                      item.data.registrationNumber &&
                        `CVR / registrering: ${item.data.registrationNumber}`,
                      item.data.address,
                      [item.data.postalCode, item.data.city].filter(Boolean).join(" "),
                      item.data.country,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </p>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                disabled={disabled || cursors.length === 1}
                onClick={() => setCursors(cursors.slice(0, -1))}
              >
                Nyere versioner
              </button>
              <button
                type="button"
                className={button}
                disabled={disabled || !page.data.hasMore || !page.data.rows.length}
                onClick={() => {
                  const last = page.data?.rows.at(-1);
                  if (last) setCursors([...cursors, last.version]);
                }}
              >
                Ældre versioner
              </button>
            </div>
          </>
        )
      )}
    </section>
  );
}

export function CustomerPlanners({
  organizationId,
  actorId,
  customerId,
  disabled,
  onManage,
}: Scope & { disabled: boolean; onManage: () => void }) {
  const load = useServerFn(getWorkCustomers);
  const [filter, setFilter] = useState({ search: "", offset: 0 });
  const page = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "planners", customerId, filter],
    queryFn: async () =>
      CustomerMembersPageSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "members",
            customerId,
            onlyEnabled: true,
            includeFormer: true,
            ...filter,
          },
        }),
      ),
    enabled: !disabled,
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  return (
    <section className={panel} aria-label="Planlægningsadgang">
      <h2 className="text-lg font-semibold">Planlægningsadgang</h2>
      <p className="text-sm text-muted-foreground">
        Giv en kollega adgang til at se kunden og oprette sager. Organisationsadministratorer har
        også adgang gennem deres rolle. De enkelte sager styres særskilt.
      </p>
      <CustomerField label="Søg planlæggere">
        <input
          className={control}
          type="search"
          maxLength={120}
          disabled={disabled}
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value, offset: 0 })}
        />
      </CustomerField>
      {page.isPending && <p role="status">Henter planlæggere…</p>}
      {page.isError ? (
        <div role="alert">
          <p>Planlæggerne kunne ikke hentes.</p>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => void page.refetch()}
          >
            Hent planlæggere igen
          </button>
        </div>
      ) : (
        page.data && (
          <>
            {!page.data.rows.length && (
              <p className="text-sm text-muted-foreground">
                Ingen særskilt tildelt planlægger i denne visning.
              </p>
            )}
            <ul className="space-y-1 text-sm">
              {page.data.rows.map((member) => (
                <li key={member.userId}>
                  {member.name}
                  {!member.activeMember
                    ? " · Medlemskab ophørt; kan ikke planlægge"
                    : member.administrator
                      ? " · Administrator"
                      : ""}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={button}
                disabled={disabled || !filter.offset}
                onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - 50) })}
              >
                Forrige planlæggere
              </button>
              <button
                type="button"
                className={button}
                disabled={disabled || !page.data.hasMore || filter.offset >= 100000}
                onClick={() => setFilter({ ...filter, offset: filter.offset + 50 })}
              >
                Næste planlæggere
              </button>
            </div>
          </>
        )
      )}
      <button type="button" className={button} disabled={disabled} onClick={onManage}>
        Administrér planlæggere
      </button>
    </section>
  );
}

export function CustomerMemberPicker({
  organizationId,
  actorId,
  customerId,
  value,
  disabled,
  onChange,
}: Scope & {
  value: CustomerMember | null;
  disabled: boolean;
  onChange: (value: CustomerMember | null) => void;
}) {
  const load = useServerFn(getWorkCustomers);
  const [filter, setFilter] = useState({ search: "", offset: 0 });
  const page = useQuery({
    queryKey: ["work-customers", actorId, organizationId, "member-options", customerId, filter],
    queryFn: async () =>
      CustomerMembersPageSchema.parse(
        await load({
          data: {
            organizationId,
            expectedActorId: actorId,
            operation: "members",
            customerId,
            onlyEnabled: false,
            includeFormer: false,
            ...filter,
          },
        }),
      ),
    retry: false,
    refetchOnWindowFocus: !disabled,
    refetchOnReconnect: !disabled,
  });
  const rows = page.isError ? [] : (page.data?.rows ?? []);
  return (
    <div className="min-w-0 space-y-2">
      <CustomerField label="Søg kollega">
        <input
          className={control}
          type="search"
          maxLength={120}
          disabled={disabled}
          value={filter.search}
          onChange={(e) => setFilter({ search: e.target.value, offset: 0 })}
        />
      </CustomerField>
      <CustomerField label="Kollega">
        <select
          className={control}
          required
          aria-label="Kollega"
          disabled={disabled}
          value={value?.userId ?? ""}
          onChange={(e) =>
            onChange(
              rows.find((r) => r.userId === e.target.value) ??
                (value?.userId === e.target.value ? value : null),
            )
          }
        >
          <option value="">Vælg en kollega</option>
          {value && !rows.some((r) => r.userId === value.userId) && (
            <option value={value.userId}>{value.name}</option>
          )}
          {rows.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </CustomerField>
      {page.isPending && <p role="status">Henter kolleger…</p>}
      {page.isError && (
        <div role="alert">
          <p>Kollegerne kunne ikke hentes.</p>
          <button
            type="button"
            className={button}
            disabled={disabled}
            onClick={() => void page.refetch()}
          >
            Hent kolleger igen
          </button>
        </div>
      )}
      {value?.administrator && (
        <p className="text-sm text-muted-foreground">
          Kollegaen har allerede adgang som organisationsadministrator.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          disabled={disabled || !filter.offset}
          onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - 50) })}
        >
          Forrige kolleger
        </button>
        <button
          type="button"
          className={button}
          disabled={disabled || page.isError || !page.data?.hasMore || filter.offset >= 100000}
          onClick={() => setFilter({ ...filter, offset: filter.offset + 50 })}
        >
          Næste kolleger
        </button>
      </div>
    </div>
  );
}
