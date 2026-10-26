import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BeregningsSnapshot,
  LavbundsProjekt,
  LedgerPost,
  Maalepunkt,
  VandstandsReading,
} from "@/types/lavbund";

const db = vi.hoisted(() => {
  type Result = { data: unknown; error: { code?: string; message: string } | null };
  const state = {
    configured: true,
    requestedDemo: false,
    response: vi.fn<(table: string, operation: string) => Result>(() => ({
      data: null,
      error: null,
    })),
  };
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => {
      const result = Promise.resolve(state.response(table, "select"));
      const query = Object.assign(result, {
        eq: vi.fn(),
        order: vi.fn(),
        maybeSingle: vi.fn(() => result),
      });
      query.eq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      return query;
    }),
    upsert: vi.fn(async () => state.response(table, "upsert")),
    insert: vi.fn(async () => state.response(table, "insert")),
    update: vi.fn(() => ({ eq: vi.fn(async () => state.response(table, "update")) })),
    delete: vi.fn(() => ({ eq: vi.fn(async () => state.response(table, "delete")) })),
  }));
  return { state, from };
});

vi.mock("@/lib/supabase/client", () => ({
  get supabase() {
    return db.state.configured ? { from: db.from } : null;
  },
  get isSupabaseConfigured() {
    return db.state.configured;
  },
}));

vi.mock("@/lib/data-mode", () => ({
  get isDemoDataEnabled() {
    return db.state.requestedDemo && !db.state.configured;
  },
  requireCustomerDatabase: () => {
    if (!db.state.configured) throw new Error("Kundedatabasen er ikke konfigureret.");
  },
}));

import {
  appendLedger,
  getGroefter,
  getLavbundOverblik,
  getLedger,
  getLinkedProjectId,
  getMaalepunkter,
  getProject,
  getProjects,
  getReadings,
  getSnapshot,
  getTransekter,
  replaceGroefter,
  replaceTransekter,
  saveMaalepunkt,
  saveProject,
  saveReading,
  saveSnapshot,
  setLinkedProject,
} from "@/services/lavbundService";

const PROJECT: LavbundsProjekt = {
  id: "1",
  navn: "Synthetic customer fixture",
  kommune: "Test",
  status: "planlagt",
  samletArealHa: 10,
  arealFordeling: [{ kulstofklasse: ">12", arealanvendelse: "Natur", buffer: false, hektar: 10 }],
  tiltag: {
    draenAfbrydes: false,
    groefterTilkastes: false,
    vandloebsbundHaeves: false,
    overrislingszoner: false,
    pumpedriftStopper: false,
  },
  vandspejlFoerM: 0.3,
  usageScope: "tilskudsordning_klimaregnskab",
  afvigelser: [],
};
const ORGANIZATION_A = "organization-a";
const ORGANIZATION_B = "organization-b";
const BOUND_PROJECT = {
  id: PROJECT.id,
  payload: PROJECT,
  linked_project_id: "core-project-a",
  core_project: { id: "core-project-a", organization_id: ORGANIZATION_A },
};
const MAALPUNKT: Maalepunkt = {
  id: "customer-point",
  projektId: PROJECT.id,
  type: "markpejling",
  position: { x: 0, y: 0 },
  intensiteter: ["standard"],
};
const READING: VandstandsReading = {
  maalepunktId: MAALPUNKT.id,
  tidspunkt: "2026-10-13T12:00:00Z",
  dybdeM: 0.3,
  kilde: "manuel_pejling",
};
const POST: LedgerPost = {
  seq: 100,
  tidspunkt: READING.tidspunkt,
  actor: "test",
  event: "test",
  detail: "synthetic",
  prevHash: "previous",
  hash: "hash",
};
const SNAPSHOT: BeregningsSnapshot = {
  projektId: PROJECT.id,
  genereret: READING.tidspunkt,
  usageScope: PROJECT.usageScope,
  faktorVersioner: { co2: "v12", fosfor: "DCE-263" },
  co2: {
    krediteretTonPrHa: 2,
    krediteretTotal: 20,
    verifikationsgrad: 1,
    verificeretTonPrHa: 2,
    verificeretTotal: 20,
    usikkerhedTotal: 0,
  },
  fosfor: {
    vandloebFoerKgAar: 0,
    vandloebEfterKgAar: 0,
    groefterFoerKgAar: 0,
    groefterEfterKgAar: 0,
    balanceKgAar: 0,
  },
};

const reads = [
  { name: "projects", run: () => getProjects(), empty: [] },
  { name: "project", run: () => getProject(PROJECT.id), empty: null },
  { name: "measurement points", run: () => getMaalepunkter(PROJECT.id), empty: [] },
  { name: "readings", run: () => getReadings(PROJECT.id), empty: [] },
  { name: "transects", run: () => getTransekter(PROJECT.id), empty: [] },
  { name: "ditches", run: () => getGroefter(PROJECT.id), empty: [] },
  { name: "ledger", run: () => getLedger(PROJECT.id), empty: [] },
  { name: "snapshot", run: () => getSnapshot(PROJECT.id), empty: null },
  { name: "linked project", run: () => getLinkedProjectId(PROJECT.id), empty: null },
];
const writes = [
  { name: "project", run: () => saveProject(PROJECT) },
  { name: "measurement point", run: () => saveMaalepunkt(MAALPUNKT) },
  { name: "reading", run: () => saveReading(PROJECT.id, READING) },
  { name: "transects", run: () => replaceTransekter(PROJECT.id, []) },
  { name: "ditches", run: () => replaceGroefter(PROJECT.id, []) },
  { name: "ledger", run: () => appendLedger(PROJECT.id, POST) },
  { name: "snapshot", run: () => saveSnapshot(SNAPSHOT) },
  { name: "linked project", run: () => setLinkedProject(PROJECT.id, null) },
];

beforeEach(() => {
  db.state.configured = true;
  db.state.requestedDemo = false;
  db.from.mockClear();
  db.state.response.mockReset();
  db.state.response.mockReturnValue({ data: null, error: null });
});

describe("lavbund customer data integrity", () => {
  it.each(reads)(
    "preserves an empty $name read even when demo was requested online",
    async ({ run, empty }) => {
      db.state.requestedDemo = true;
      await expect(run()).resolves.toEqual(empty);
      expect(db.from).toHaveBeenCalled();
    },
  );

  it.each(reads)("preserves the source error for missing $name tables", async ({ run }) => {
    const error = { code: "PGRST205", message: "Customer table unavailable" };
    db.state.response.mockReturnValue({ data: null, error });
    await expect(run()).rejects.toBe(error);
  });

  it.each([...reads, ...writes])(
    "requires a customer database for $name without explicit offline demo",
    async ({ run }) => {
      db.state.configured = false;
      await expect(run()).rejects.toThrow("Kundedatabasen er ikke konfigureret");
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it.each(writes)(
    "does not report a saved $name when its database mutation fails",
    async ({ run }) => {
      const error = { code: "PGRST205", message: "Customer mutation unavailable" };
      db.state.response.mockImplementation((_table, operation) =>
        operation === "select" ? { data: { id: PROJECT.id }, error: null } : { data: null, error },
      );
      await expect(run()).rejects.toBe(error);
    },
  );

  it.each(writes.filter(({ name }) => name !== "project"))(
    "rejects a $name write if the parent project is unavailable",
    async ({ run }) => {
      await expect(run()).rejects.toThrow("Lavbundsprojektet findes ikke");
      expect(db.state.response.mock.calls.every(([, operation]) => operation === "select")).toBe(
        true,
      );
    },
  );

  it("preserves parent-project SELECT failures before any mutation", async () => {
    const error = { code: "42501", message: "permission denied" };
    db.state.response.mockReturnValue({ data: null, error });
    await expect(saveReading(PROJECT.id, READING)).rejects.toBe(error);
    expect(db.state.response).toHaveBeenCalledExactlyOnceWith("lavbund_projekter", "select");
  });

  it("returns only database payloads in customer mode", async () => {
    db.state.response.mockReturnValue({ data: [{ payload: PROJECT }], error: null });
    await expect(getProjects()).resolves.toEqual([PROJECT]);
  });

  it("reports a genuine empty overview without the sample project totals", async () => {
    await expect(getLavbundOverblik(ORGANIZATION_A)).resolves.toEqual({
      antalProjekter: 0,
      samletArealHa: 0,
      krediteretTotal: 0,
      verificeretTotal: 0,
    });
  });

  it("does not turn a failed snapshot read into a verified zero", async () => {
    const error = { code: "42501", message: "Snapshot unavailable" };
    db.state.response.mockImplementation((table) =>
      table === "lavbund_projekter"
        ? { data: [BOUND_PROJECT], error: null }
        : { data: null, error },
    );
    await expect(getLavbundOverblik(ORGANIZATION_A)).rejects.toBe(error);
  });

  it("keeps the verified total unknown if any customer project lacks a snapshot", async () => {
    db.state.response.mockImplementation((table) => ({
      data: table === "lavbund_projekter" ? [BOUND_PROJECT] : null,
      error: null,
    }));
    const overview = await getLavbundOverblik(ORGANIZATION_A);
    expect(overview.antalProjekter).toBe(1);
    expect(overview.samletArealHa).toBe(10);
    expect(overview.verificeretTotal).toBeNull();
  });

  it("sums a database-confirmed snapshot including a verified zero", async () => {
    db.state.response.mockImplementation((table) => ({
      data:
        table === "lavbund_projekter"
          ? [BOUND_PROJECT]
          : { payload: { ...SNAPSHOT, co2: { ...SNAPSHOT.co2, verificeretTotal: 0 } } },
      error: null,
    }));
    expect((await getLavbundOverblik(ORGANIZATION_A)).verificeretTotal).toBe(0);
  });

  it("requires the selected organization before any customer overview query", async () => {
    await expect(getLavbundOverblik()).rejects.toThrow("Vælg en organisation");
    await expect(getLavbundOverblik("")).rejects.toThrow("Vælg en organisation");
    expect(db.from).not.toHaveBeenCalled();
  });

  it("keeps two RLS-readable organizations separate and excludes unlinked projects", async () => {
    const projectB = {
      ...PROJECT,
      id: "2",
      samletArealHa: 25,
      kommune: PROJECT.kommune,
      arealFordeling: PROJECT.arealFordeling.map((area) => ({ ...area, hektar: 25 })),
    };
    const rows = [
      BOUND_PROJECT,
      {
        id: projectB.id,
        payload: projectB,
        linked_project_id: "core-project-b",
        core_project: { id: "core-project-b", organization_id: ORGANIZATION_B },
      },
      {
        id: "unlinked",
        payload: { ...PROJECT, id: "unlinked", samletArealHa: 500 },
        linked_project_id: null,
        core_project: null,
      },
    ];
    db.state.response.mockImplementation((table) => ({
      data: table === "lavbund_projekter" ? rows : null,
      error: null,
    }));

    const overviewA = await getLavbundOverblik(ORGANIZATION_A);
    expect(overviewA).toMatchObject({ antalProjekter: 1, samletArealHa: 10 });
    const projectQueryA = db.from.mock.results[0].value.select.mock.results[0].value;
    expect(db.from.mock.results[0].value.select).toHaveBeenCalledWith(
      "id, payload, linked_project_id, core_project:projects!linked_project_id!inner(id, organization_id)",
    );
    expect(projectQueryA.eq).toHaveBeenCalledWith("core_project.organization_id", ORGANIZATION_A);
    const snapshotQueryA = db.from.mock.results[1].value.select.mock.results[0].value;
    expect(snapshotQueryA.eq).toHaveBeenCalledExactlyOnceWith("projekt_id", PROJECT.id);

    db.from.mockClear();
    const overviewB = await getLavbundOverblik(ORGANIZATION_B);
    expect(overviewB).toMatchObject({ antalProjekter: 1, samletArealHa: 25 });
    const snapshotQueryB = db.from.mock.results[1].value.select.mock.results[0].value;
    expect(snapshotQueryB.eq).toHaveBeenCalledExactlyOnceWith("projekt_id", projectB.id);
    expect(overviewA.krediteretTotal).not.toBe(overviewB.krediteretTotal);
  });

  it("preserves scoped project source failures instead of returning another organization or demo", async () => {
    const error = { code: "PGRST205", message: "relationship source unavailable" };
    db.state.response.mockReturnValue({ data: null, error });
    await expect(getLavbundOverblik(ORGANIZATION_A)).rejects.toBe(error);
  });

  it("rejects same-organization payload identity mismatch before reading any snapshot", async () => {
    db.state.response.mockReturnValue({
      data: [{ ...BOUND_PROJECT, payload: { ...PROJECT, id: "other-project" } }],
      error: null,
    });
    await expect(getLavbundOverblik(ORGANIZATION_A)).rejects.toThrow("datagrundlag matcher ikke");
    expect(db.from).toHaveBeenCalledExactlyOnceWith("lavbund_projekter");
  });

  it("does not sum a snapshot payload belonging to a different project", async () => {
    db.state.response.mockImplementation((table) => ({
      data:
        table === "lavbund_projekter"
          ? [BOUND_PROJECT]
          : { payload: { ...SNAPSHOT, projektId: "other-project" } },
      error: null,
    }));
    await expect(getLavbundOverblik(ORGANIZATION_A)).rejects.toThrow("snapshot matcher ikke");
  });
});
