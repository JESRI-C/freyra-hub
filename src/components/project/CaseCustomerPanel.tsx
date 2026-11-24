import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWorkCustomers } from "@/lib/work-customers.functions";
import {
  CaseCustomerContextSchema,
  CustomerSummarySchema,
  CustomerListSchema,
  type CaseCustomerContext,
} from "@/lib/work-customers";
import { useCustomerCommand } from "./useCustomerCommand";
import { CustomerField } from "./CustomerField";
import { CustomerContactPicker } from "./CustomerCollections";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const control =
  "mt-1 block min-h-11 w-full min-w-0 rounded-xl border bg-background px-3 py-2 text-base";
type Props = {
  organizationId: string;
  projectId: string;
  actorId: string;
  actionId?: string;
  onEditingChange: (editing: boolean) => void;
};

export function CaseCustomerPanel(props: Props) {
  return (
    <CaseContext
      key={`${props.actorId}:${props.organizationId}:${props.projectId}:${props.actionId ?? "case"}`}
      {...props}
    />
  );
}
function CaseContext({ organizationId, projectId, actorId, actionId, onEditingChange }: Props) {
  const load = useServerFn(getWorkCustomers);
  const cache = useQueryClient();
  const [editing, setEditing] = useState<"reference" | "binding" | null>(null);
  useEffect(() => {
    onEditingChange(editing !== null);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);
  const key = ["work-case-customer", actorId, organizationId, projectId, actionId ?? null];
  const context = useQuery({
    queryKey: key,
    queryFn: async () =>
      CaseCustomerContextSchema.parse(
        await load({
          data: actionId
            ? { organizationId, expectedActorId: actorId, operation: "job", projectId, actionId }
            : { organizationId, expectedActorId: actorId, operation: "case", projectId },
        }),
      ),
    retry: false,
    refetchOnWindowFocus: !editing,
    refetchOnReconnect: !editing,
  });
  const current =
    !context.isError &&
    context.data?.projectId === projectId &&
    context.data.actionId === (actionId ?? null)
      ? context.data
      : undefined;
  function saved() {
    setEditing(null);
    void cache.invalidateQueries({
      queryKey: ["work-case-customer", actorId, organizationId, projectId],
    });
  }
  return (
    <section
      aria-label="Kunde og sagsreference"
      className="space-y-3 rounded-2xl border bg-card p-4 [overflow-wrap:anywhere]"
    >
      <h2 className="text-base font-semibold">Kunde og sag</h2>
      {context.isPending && (
        <p role="status" className="text-sm">
          Henter sagssammenhæng…
        </p>
      )}
      {context.isError && (
        <div role="alert" className="text-sm">
          <p>Sagssammenhængen kunne ikke kontrolleres.</p>
          <button className={button} onClick={() => void context.refetch()}>
            Prøv igen
          </button>
        </div>
      )}
      {current && !editing && (
        <>
          {current.binding ? (
            <>
              <p className="font-medium">
                {current.binding.number} · {current.binding.customerName}
              </p>
              <p className="text-sm">
                Kundens reference: {current.binding.customerReference || "Ikke angivet"}
              </p>
              {current.binding.contact && (
                <div className="text-sm">
                  <p>
                    {current.binding.contact.name}
                    {current.binding.contact.title ? ` · ${current.binding.contact.title}` : ""}
                  </p>
                  <p>
                    {[current.binding.contact.phone, current.binding.contact.email]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              )}
              {current.canEdit && (
                <p className="text-xs text-muted-foreground">
                  Sagsgrundlag version {current.binding.version}. Kunde og kontakt bevares, når
                  registret ændres.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Der er ikke knyttet en kunde til sagen.</p>
          )}
          {current.canEdit && (
            <div className="flex flex-wrap gap-2">
              {current.binding && (
                <button className={button} onClick={() => setEditing("reference")}>
                  Ret kundens reference
                </button>
              )}
              <button className={button} onClick={() => setEditing("binding")}>
                {current.binding ? "Vælg kunde eller kontakt" : "Tilknyt kunde"}
              </button>
            </div>
          )}
        </>
      )}
      {current && editing && (
        <CaseContextForm
          key={editing}
          kind={editing}
          context={current}
          actorId={actorId}
          onClose={() => {
            setEditing(null);
            void context.refetch();
          }}
          onSaved={saved}
        />
      )}
    </section>
  );
}
function CaseContextForm({
  kind,
  context,
  actorId,
  onClose,
  onSaved,
}: {
  kind: "reference" | "binding";
  context: CaseCustomerContext;
  actorId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const load = useServerFn(getWorkCustomers);
  const [reference, setReference] = useState(context.binding?.customerReference ?? "");
  const [customerId, setCustomerId] = useState(context.binding?.customerId ?? "");
  const [contactId, setContactId] = useState(context.binding?.contactId ?? "");
  const [contactValid, setContactValid] = useState(!context.binding?.contactId);
  const [filter, setFilter] = useState({ search: "", offset: 0 });
  const command = useCustomerCommand(context.organizationId, actorId, onSaved);
  const customers = useQuery({
    queryKey: ["work-customers", actorId, context.organizationId, "binding-options", filter],
    queryFn: async () =>
      CustomerListSchema.parse(
        await load({
          data: {
            organizationId: context.organizationId,
            expectedActorId: actorId,
            operation: "list",
            includeArchived: false,
            ...filter,
          },
        }),
      ),
    enabled: kind === "binding",
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["work-customers", actorId, context.organizationId, "summary", customerId],
    queryFn: async () =>
      CustomerSummarySchema.parse(
        await load({
          data: {
            organizationId: context.organizationId,
            expectedActorId: actorId,
            operation: "summary",
            customerId,
          },
        }),
      ),
    enabled: kind === "binding" && !!customerId,
    retry: false,
  });
  const selected =
    !detail.isError && detail.data?.customer.id === customerId ? detail.data : undefined;
  const canBind = !!selected && !selected.customer.data.archived && (!contactId || contactValid);
  return (
    <form
      aria-label={kind === "reference" ? "Ret kundens reference" : "Tilknyt kunde"}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!command.uncertain && kind === "binding" && !canBind) return;
        void command.submit(
          kind === "reference"
            ? {
                operation: "save_reference",
                projectId: context.projectId,
                expectedVersion: context.binding?.version ?? 0,
                customerReference: reference,
              }
            : {
                operation: "bind_case",
                projectId: context.projectId,
                customerId,
                contactId: contactId || null,
                expectedVersion: context.binding?.version ?? 0,
                customerReference: reference,
              },
        );
      }}
    >
      <fieldset disabled={command.locked} className="min-w-0 space-y-3">
        {kind === "binding" && (
          <>
            <label className="block text-sm font-medium">
              Søg kunde
              <input
                className={control}
                type="search"
                maxLength={120}
                value={filter.search}
                onChange={(e) => setFilter({ search: e.target.value, offset: 0 })}
              />
            </label>
            {customers.isPending && <p role="status">Henter kunder…</p>}
            {customers.isError && (
              <p role="alert">Kunderne kunne ikke hentes. Luk udkastet og prøv igen.</p>
            )}
            {!customers.isError && customers.data && (
              <>
                <CustomerField label="Kunde">
                  <select
                    className={control}
                    required
                    value={customerId}
                    onChange={(e) => {
                      setCustomerId(e.target.value);
                      setContactId("");
                    }}
                  >
                    <option value="">Vælg kunde</option>
                    {customerId && !customers.data.rows.some((c) => c.id === customerId) && (
                      <option value={customerId}>
                        {selected?.customer.data.name ?? "Valgt kunde · kontrollerer adgang"}
                      </option>
                    )}
                    {customers.data.rows.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.number} · {c.data.name}
                      </option>
                    ))}
                  </select>
                </CustomerField>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={!filter.offset}
                    onClick={() =>
                      setFilter({ ...filter, offset: Math.max(0, filter.offset - 50) })
                    }
                  >
                    Forrige kunder
                  </button>
                  <button
                    type="button"
                    className={button}
                    disabled={!customers.data.hasMore || filter.offset >= 100000}
                    onClick={() => setFilter({ ...filter, offset: filter.offset + 50 })}
                  >
                    Næste kunder
                  </button>
                </div>
              </>
            )}
            {customerId && detail.isPending && <p role="status">Henter kontakter…</p>}
            {detail.isError && <p role="alert">Den valgte kunde er ikke tilgængelig.</p>}
            {selected && (
              <CustomerContactPicker
                organizationId={context.organizationId}
                actorId={actorId}
                customerId={customerId}
                label="Kontaktperson"
                value={contactId}
                onChange={setContactId}
                onValidityChange={setContactValid}
                disabled={command.locked}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Gemning vælger kundens og kontaktens aktuelle version til sagen. Tidligere
              sagsgrundlag bevares.
            </p>
          </>
        )}
        <label className="block text-sm font-medium">
          Kundens reference
          <input
            className={control}
            maxLength={240}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
      </fieldset>
      {command.error && (
        <p role="alert" className="text-sm text-destructive">
          {command.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          disabled={command.busy || (!command.uncertain && kind === "binding" && !canBind)}
          type="submit"
        >
          {command.busy
            ? "Gemmer…"
            : command.uncertain
              ? "Prøv samme gemning igen"
              : "Gem sagsgrundlag"}
        </button>
        <button className={button} disabled={command.locked} type="button" onClick={onClose}>
          Fortryd
        </button>
      </div>
    </form>
  );
}
