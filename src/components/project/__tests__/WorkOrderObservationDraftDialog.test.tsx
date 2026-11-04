// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CreateWorkOrderObservationDraftInput,
  ObservationDraftSource,
} from "@/lib/work-order-observation-drafts";
import { WorkOrderRequestError } from "@/lib/work-order-access";
const m = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  created: vi.fn(),
  actor: "00000000-0000-4000-8000-000000000001" as string | null,
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: m.actor ? { id: m.actor } : null, loading: false }),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
  Link: ({
    children,
    params,
    search,
  }: {
    children: React.ReactNode;
    params: unknown;
    search: unknown;
  }) => (
    <a
      href="/app/projects/$slug"
      data-params={JSON.stringify(params)}
      data-search={JSON.stringify(search)}
    >
      {children}
    </a>
  ),
}));
vi.mock("@/lib/work-order-observation-drafts.functions", () => ({
  listWorkOrderObservationSources: m.list,
  createWorkOrderObservationDraft: m.create,
  getWorkOrderObservationDraft: m.get,
}));
import { WorkOrderObservationDraftDialog } from "../WorkOrderObservationDraftDialog";
import { WorkOrderObservationOrigin } from "../WorkOrderObservationOrigin";
import { WorkOrderObservationSourceDetails } from "../WorkOrderObservationSourceDetails";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source: ObservationDraftSource = {
  observation_id: id(10),
  source_hash: "a".repeat(64),
  snapshot: {
    id: id(10),
    project_id: id(3),
    zone_id: null,
    observation_type: "species",
    observed_at: "2026-11-04T10:00:00Z",
    observer_id: id(1),
    species_name: "Engplante",
    species_confidence: null,
    count_value: 2,
    latitude: 55.123456,
    longitude: 9.123456,
    accuracy_m: 5,
    notes: "<img src=x onerror=alert(1)> Synlig plante ved vandløbet",
    visibility: "precise",
    status: "confirmed",
    metadata: { unreviewed: true },
    created_at: null,
    updated_at: null,
  },
  media_refs: [
    {
      id: id(11),
      observation_id: id(10),
      media_type: "photo",
      storage_path: "secret/private/raw-original.jpg",
      mime_type: "image/jpeg",
      file_size_bytes: 1200,
      width: 100,
      height: 200,
      exif_data: null,
      ai_suggestions: { species: "Forslag" },
      uploaded_by: id(1),
      created_at: null,
    },
  ],
};
function origin(input: CreateWorkOrderObservationDraftInput, rows = [source]) {
  return {
    action_id: input.actionId,
    organization_id: input.organizationId,
    project_id: input.projectId,
    user_id: input.expectedActorId,
    request_id: input.requestId,
    created_by: input.expectedActorId,
    created_at: "2026-11-04T12:00:00Z",
    title: input.title,
    description: input.description,
    status: "draft" as const,
    sources: rows,
  };
}
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, cache: QueryClient;
const key = () => `freyra-observation-draft-attempt/v1:${id(1)}:${id(2)}`;
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 15));
  });
}
async function render(organizationId = id(2), initialProjectId: string | null = null) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={cache}>
        <WorkOrderObservationDraftDialog
          organizationId={organizationId}
          projects={[
            { id: id(3), name: "Bykær" },
            { id: id(4), name: "Mosen" },
          ]}
          initialProjectId={initialProjectId}
          onCreated={m.created}
        />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(found, text).toBeTruthy();
  return found!;
}
async function click(text: string) {
  await act(async () => button(text).click());
  await flush();
}
function field(label: string) {
  const node = [...document.querySelectorAll("label")]
    .find((node) => node.firstChild?.textContent?.trim() === label)
    ?.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input,select,textarea");
  expect(node, label).toBeTruthy();
  return node!;
}
async function change(label: string, value: string) {
  const node = field(label);
  await act(async () => {
    const proto =
      node instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : node instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(node, value);
    node.dispatchEvent(
      new Event(node instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
  await flush();
}
async function prepare() {
  await render();
  await click("Opret fra feltobservationer");
  await change("Projekt", id(3));
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => checkbox.click());
  await change("Titel på arbejdsordren", "  Pleje ved Bykær  ");
  await change("Beskrivelse", "  Kontrollér planten før arbejdet  ");
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  sessionStorage.clear();
  m.actor = id(1);
  m.list.mockResolvedValue({ items: [source], nextCursor: null });
  m.create.mockImplementation(async ({ data }: { data: CreateWorkOrderObservationDraftInput }) =>
    origin(data),
  );
  m.get.mockResolvedValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  cache.clear();
  host.remove();
  vi.restoreAllMocks();
});
describe("work order draft from existing field observations", () => {
  it("requires an explicit project, reviews safe source metadata and creates one ordinary draft with a receipt link", async () => {
    await render();
    await click("Opret fra feltobservationer");
    expect(m.list).not.toHaveBeenCalled();
    await change("Projekt", id(3));
    expect(m.list).toHaveBeenCalledWith({
      data: {
        expectedActorId: id(1),
        organizationId: id(2),
        projectId: id(3),
        cursor: null,
        pageSize: 30,
        search: "",
      },
    });
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(document.querySelector('[aria-label="Valgte kilder"]')?.textContent).toContain(
      "Gemt position",
    );
    expect(document.body.textContent).not.toContain("secret/private");
    expect(document.querySelector("img")).toBeNull();
    expect(document.body.textContent).toContain("ikke en faglig godkendelse");
    await change("Titel på arbejdsordren", "  Pleje  ");
    m.create.mockImplementation(
      async ({ data }: { data: CreateWorkOrderObservationDraftInput }) => {
        expect(JSON.parse(sessionStorage.getItem(key())!)).toEqual(data);
        expect(JSON.stringify(data)).not.toContain("snapshot");
        return origin(data);
      },
    );
    await click("Opret arbejdsordrekladde");
    const data = m.create.mock.calls[0][0].data;
    expect(data.title).toBe("Pleje");
    expect(data.sources).toEqual([
      { observationId: source.observation_id, sourceHash: source.source_hash },
    ]);
    expect(sessionStorage.getItem(key())).toBeNull();
    expect(m.created).toHaveBeenCalledTimes(1);
    const link = document.querySelector('a[href="/app/projects/$slug"]')!;
    expect(JSON.parse(link.getAttribute("data-search")!)).toEqual({
      tab: "handlinger",
      task: data.actionId,
      work: "plan",
    });
  });
  it("retains title and selection after a source conflict and requires explicit refresh and renewed review", async () => {
    m.create.mockRejectedValueOnce(new Error("Opgaven er ændret. Genindlæs før du gemmer."));
    await prepare();
    await click("Opret arbejdsordrekladde");
    expect(field("Titel på arbejdsordren").value).toBe("  Pleje ved Bykær  ");
    expect(document.querySelector('[aria-label="Valgte kilder"]')).not.toBeNull();
    expect(button("Opret arbejdsordrekladde").disabled).toBe(true);
    expect(sessionStorage.getItem(key())).toBeNull();
    const changed = {
      ...source,
      source_hash: "b".repeat(64),
      snapshot: { ...source.snapshot, notes: "Ny feltkontrol" },
    };
    m.list.mockResolvedValue({ items: [changed], nextCursor: null });
    await click("Genindlæs kilder til ny gennemgang");
    expect(document.querySelector('[aria-label="Valgte kilder"]')?.textContent).toContain(
      "Ny feltkontrol",
    );
    expect(button("Opret arbejdsordrekladde").disabled).toBe(true);
    const review = [...document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (node) => node.closest("label")?.textContent?.includes("Jeg har gennemgået"),
    )!;
    await act(async () => review.click());
    await flush();
    await click("Opret arbejdsordrekladde");
    expect(m.create.mock.calls[1][0].data.sources).toEqual([
      { observationId: source.observation_id, sourceHash: changed.source_hash },
    ]);
  });
  it("persists an uncertain attempt and reuses its exact normalized payload after closing and remounting", async () => {
    m.create.mockRejectedValueOnce(new Error("lost response"));
    await prepare();
    await click("Opret arbejdsordrekladde");
    const first = m.create.mock.calls[0][0].data;
    expect((field("Titel på arbejdsordren") as HTMLInputElement).disabled).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(key())!)).toEqual(first);
    await click("Luk");
    await act(async () => root.render(<div />));
    await render();
    await click("Opret fra feltobservationer");
    expect(field("Titel på arbejdsordren").value).toBe("Pleje ved Bykær");
    expect((field("Titel på arbejdsordren") as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).not.toContain("Henter feltobservationer…");
    await click("Genprøv samme oprettelse");
    expect(m.create.mock.calls[1][0].data).toEqual(first);
    expect(sessionStorage.getItem(key())).toBeNull();
    expect(m.created).toHaveBeenCalledTimes(1);
  });
  it("preserves the same request through access failure, hides sources and does not leak it into another organization", async () => {
    m.create.mockRejectedValueOnce(new WorkOrderRequestError("access"));
    await prepare();
    await click("Opret arbejdsordrekladde");
    expect(sessionStorage.getItem(key())).not.toBeNull();
    expect(document.querySelector('[aria-label="Valgte kilder"]')).toBeNull();
    await render(id(5));
    await click("Opret fra feltobservationer");
    expect(field("Titel på arbejdsordren").value).toBe("");
    expect(document.body.textContent).not.toContain(source.snapshot.notes!);
    expect(sessionStorage.getItem(key())).not.toBeNull();
  });
  it("keeps the in-memory identities and blocks closing if retry persistence is unavailable", async () => {
    await prepare();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    m.create.mockRejectedValueOnce(new Error("network"));
    await click("Opret arbejdsordrekladde");
    const first = m.create.mock.calls[0][0].data;
    expect(document.body.textContent).toContain("Hold dette vindue åbent");
    await click("Luk");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await click("Genprøv samme oprettelse");
    expect(m.create.mock.calls[1][0].data).toEqual(first);
  });

  it("shows the confirmed receipt when access returns and retries the original request", async () => {
    m.create.mockRejectedValueOnce(new WorkOrderRequestError("access"));
    await prepare();
    await click("Opret arbejdsordrekladde");
    const input = m.create.mock.calls[0][0].data;
    await click("Genprøv samme oprettelse");
    expect(m.create.mock.calls[1][0].data).toEqual(input);
    expect(document.querySelector('[aria-label="Oprettet arbejdsordrekladde"]')).not.toBeNull();
    expect(sessionStorage.getItem(key())).toBeNull();
  });

  it("isolates a preserved attempt from another actor in the same organization", async () => {
    m.create.mockRejectedValueOnce(new Error("lost response"));
    await prepare();
    await click("Opret arbejdsordrekladde");
    m.actor = id(8);
    await render();
    await click("Opret fra feltobservationer");
    expect(field("Titel på arbejdsordren").value).toBe("");
    expect(document.querySelector('[aria-label="Valgte kilder"]')).toBeNull();
    expect(sessionStorage.getItem(key())).not.toBeNull();
  });
  it("requires explicit discard for a dirty form and never treats an absent receipt as permission to regenerate identities", async () => {
    await prepare();
    await click("Luk");
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    await click("Behold kladden");
    m.create.mockRejectedValueOnce(new Error("timeout"));
    await click("Opret arbejdsordrekladde");
    const first = m.create.mock.calls[0][0].data;
    await click("Kontrollér oprettelsen");
    expect(m.get).toHaveBeenCalledWith({
      data: {
        expectedActorId: id(1),
        organizationId: id(2),
        projectId: id(3),
        actionId: first.actionId,
      },
    });
    expect(JSON.parse(sessionStorage.getItem(key())!)).toEqual(first);
    expect(button("Genprøv samme oprettelse")).toBeTruthy();
    m.get.mockResolvedValue(origin(first));
    await click("Kontrollér oprettelsen");
    expect(m.created).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(key())).toBeNull();
  });
  it("fails closed on an unreadable persisted attempt instead of silently overwriting its identity", async () => {
    sessionStorage.setItem(key(), "{broken");
    await prepare();
    expect(button("Opret arbejdsordrekladde").disabled).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(key())).toBe("{broken");
  });

  it.each(["source hash", "creator"])(
    "does not accept a receipt with a different %s for a preserved attempt",
    async (mismatch) => {
      m.create.mockRejectedValueOnce(new Error("lost response"));
      await prepare();
      await click("Opret arbejdsordrekladde");
      const input = m.create.mock.calls[0][0].data;
      const receipt = origin(input);
      m.get.mockResolvedValue(
        mismatch === "source hash"
          ? { ...receipt, sources: [{ ...source, source_hash: "b".repeat(64) }] }
          : { ...receipt, created_by: id(99) },
      );
      await click("Kontrollér oprettelsen");
      expect(m.created).not.toHaveBeenCalled();
      expect(JSON.parse(sessionStorage.getItem(key())!)).toEqual(input);
      expect(document.querySelector('[aria-label="Oprettet arbejdsordrekladde"]')).toBeNull();
      expect(button("Genprøv samme oprettelse").disabled).toBe(false);
    },
  );
});

describe("preserved observation origin", () => {
  it.each([
    ["species", "confirmed", "Artsobservation", "Bekræftet registrering"],
    ["manual", "draft", "Manuel registrering", "Kladde"],
    ["field", "rejected", "Feltobservation", "Afvist registrering"],
    ["inspection", "draft", "Besigtigelse", "Kladde"],
    ["__proto__", "toString", "__proto__", "toString"],
  ])(
    "presents %s/%s without changing the stored source or implying professional approval",
    async (type, status, typeLabel, statusLabel) => {
      const copy = {
        ...source,
        snapshot: { ...source.snapshot, species_name: null, observation_type: type, status },
      };
      const stored = JSON.stringify(copy);
      await act(async () => root.render(<WorkOrderObservationSourceDetails source={copy} />));
      expect(host.textContent).toContain(typeLabel);
      expect(host.textContent).toContain(`Registreringsstatus: ${statusLabel}`);
      expect(host.textContent).not.toContain("Fagligt godkendt");
      expect(JSON.stringify(copy)).toBe(stored);
    },
  );

  it("uses the same Danish source-state labels in the observation picker and selected preview", async () => {
    const inspection = {
      ...source,
      snapshot: {
        ...source.snapshot,
        species_name: null,
        observation_type: "inspection",
        status: "draft",
      },
    };
    m.list.mockResolvedValue({ items: [inspection], nextCursor: null });
    await render(id(2), id(3));
    await click("Opret fra feltobservationer");
    expect(document.body.textContent).toContain("Besigtigelse");
    expect(document.body.textContent).toContain("Kladde");
    await act(async () =>
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
    );
    expect(document.querySelector('[aria-label="Valgte kilder"]')?.textContent).toContain(
      "Registreringsstatus: Kladde",
    );
    expect(inspection.snapshot.observation_type).toBe("inspection");
    expect(inspection.snapshot.status).toBe("draft");
    expect(inspection.source_hash).toBe(source.source_hash);
  });

  it("loads only for enabled manager context, displays a stored snapshot and renders nothing for an ordinary job", async () => {
    const props = { scope: { organizationId: id(2), projectId: id(3) }, actionId: id(6) };
    async function show(enabled: boolean) {
      await act(async () =>
        root.render(
          <QueryClientProvider client={cache}>
            <WorkOrderObservationOrigin {...props} enabled={enabled} />
          </QueryClientProvider>,
        ),
      );
      await flush();
    }
    await show(false);
    expect(m.get).not.toHaveBeenCalled();
    await show(true);
    expect(m.get).toHaveBeenCalledWith({
      data: { ...props.scope, actionId: id(6), expectedActorId: id(1) },
    });
    expect(host.textContent).toBe("");
    const request = {
      expectedActorId: id(1),
      organizationId: id(2),
      projectId: id(3),
      actionId: id(6),
      requestId: id(7),
      title: "Kladde",
      description: "",
      sources: [{ observationId: source.observation_id, sourceHash: source.source_hash }],
    };
    m.get.mockResolvedValue(origin(request));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["work-order-observation-origin"] });
    });
    await flush();
    expect(host.textContent).toContain(source.snapshot.notes!);
    expect(host.textContent).not.toContain("secret/private");
    expect(m.list).not.toHaveBeenCalled();
    m.get.mockRejectedValue(new WorkOrderRequestError("access"));
    await act(async () => {
      await cache.invalidateQueries({ queryKey: ["work-order-observation-origin"] });
    });
    await flush();
    expect(host.textContent).not.toContain(source.snapshot.notes!);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it.each([
    ["hidden", 55.123456, "Position skjult"],
    ["masked", 55.123456, "Afrundet position: 55.12, 9.12"],
    ["zone_only", 55.123456, "Afrundet zoneposition: 55.1, 9.1"],
    ["precise", "NaN", "Position uafklaret"],
  ] as const)(
    "respects %s visibility without coercing special source coordinates",
    async (visibility, latitude, label) => {
      await act(async () =>
        root.render(
          <WorkOrderObservationSourceDetails
            source={{ ...source, snapshot: { ...source.snapshot, visibility, latitude } }}
          />,
        ),
      );
      expect(host.textContent).toContain(label);
      expect(host.textContent).not.toContain("55.123456");
    },
  );
});
