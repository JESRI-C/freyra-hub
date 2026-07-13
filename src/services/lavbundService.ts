// Service-lag for LavbundsMRV. UI-komponenter kalder KUN disse funktioner.
//
// Læser/skriver nu Supabase-tabellerne lavbund_* (payload jsonb = domæneobjekt).
// Falder gracefully tilbage til mock-data når Supabase ikke er konfigureret,
// tabellerne mangler (PGRST205) eller databasen endnu er tom — så demo-projektet
// altid er synligt og modulet aldrig crasher.
import {
  MOCK_GROEFTER,
  MOCK_LEDGER,
  MOCK_MAALEPUNKTER,
  MOCK_PROJEKTER,
  MOCK_READINGS,
  MOCK_SNAPSHOTS,
  MOCK_TRANSEKTER,
} from "@/data/lavbundMockData";
import type {
  BeregningsSnapshot,
  GroeftStraekning,
  LavbundsProjekt,
  LedgerPost,
  Maalepunkt,
  Transekt,
  VandstandsReading,
} from "@/types/lavbund";
import { supabase, isSupabaseConfigured } from "@/lib/supabase/client";

// Lavbund-tabellerne er nyere end den genererede Database-type — klienten
// tilgås derfor løst her, men alle payloads er typet ved modulets rand.
interface LooseResult<T> {
  data: T;
  error: LooseError | null;
}
interface LooseError {
  code?: string;
  message: string;
}
interface LooseQuery {
  eq(col: string, v: unknown): LooseQuery;
  order(col: string, opts?: { ascending?: boolean }): LooseQuery;
  maybeSingle(): Promise<LooseResult<unknown>>;
  then<R>(onfulfilled: (v: LooseResult<unknown[] | null>) => R): Promise<R>;
}
interface LooseClient {
  from(table: string): {
    select(cols: string): LooseQuery;
    upsert(rows: unknown, opts?: { onConflict?: string }): Promise<{ error: LooseError | null }>;
    insert(rows: unknown): Promise<{ error: LooseError | null }>;
    update(patch: unknown): { eq(col: string, v: unknown): Promise<{ error: LooseError | null }> };
    delete(): { eq(col: string, v: unknown): Promise<{ error: LooseError | null }> };
  };
}

function client(): LooseClient | null {
  if (!isSupabaseConfigured || !supabase) return null;
  return supabase as unknown as LooseClient;
}

/** PGRST205 = tabellen findes ikke endnu (migration ikke kørt). */
function isMissingTable(err: LooseError | null): boolean {
  return err?.code === "PGRST205";
}

// In-memory mock-lager (fallback + dev uden Supabase).
const projekter: LavbundsProjekt[] = MOCK_PROJEKTER.map((p) => ({ ...p }));

// ─── Projekter ────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<LavbundsProjekt[]> {
  const db = client();
  if (db) {
    const { data, error } = await db
      .from("lavbund_projekter")
      .select("payload")
      .order("id");
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error && data && data.length > 0) {
      return (data as Array<{ payload: LavbundsProjekt }>).map((r) => ({ ...r.payload }));
    }
  }
  return projekter.map((p) => ({ ...p }));
}

export async function getProject(id: string): Promise<LavbundsProjekt | null> {
  const db = client();
  if (db) {
    const { data, error } = await db
      .from("lavbund_projekter")
      .select("payload")
      .eq("id", id)
      .maybeSingle();
    if (error && !isMissingTable(error)) throw new Error(error.message);
    const row = data as { payload: LavbundsProjekt } | null;
    if (!error && row) return { ...row.payload };
  }
  const p = projekter.find((x) => x.id === id) ?? null;
  return p ? { ...p } : null;
}

export async function saveProject(p: LavbundsProjekt): Promise<LavbundsProjekt> {
  const db = client();
  if (db) {
    const { error } = await db.from("lavbund_projekter").upsert(
      [
        {
          id: p.id,
          navn: p.navn,
          status: p.status,
          payload: p,
          updated_at: new Date().toISOString(),
        },
      ],
      { onConflict: "id" },
    );
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error) return { ...p };
  }
  const i = projekter.findIndex((x) => x.id === p.id);
  if (i >= 0) projekter[i] = { ...p };
  else projekter.push({ ...p });
  return { ...p };
}

// ─── Kobling til kerneprojekt (dashboard-indicators) ─────────────────────────

/** Læs hvilket GoFreyra-kerneprojekt lavbundsprojektet er koblet til. */
export async function getLinkedProjectId(projektId: string): Promise<string | null> {
  const db = client();
  if (!db) return null;
  const { data, error } = await db
    .from("lavbund_projekter")
    .select("linked_project_id")
    .eq("id", projektId)
    .maybeSingle();
  if (error) return null;
  return (data as { linked_project_id: string | null } | null)?.linked_project_id ?? null;
}

/**
 * Kobl (eller afkobl med null) lavbundsprojektet til et kerneprojekt, så
 * bogførte snapshots skubber verificeret CO₂ til projektets indicators.
 */
export async function setLinkedProject(projektId: string, coreProjectId: string | null): Promise<void> {
  const db = client();
  if (!db) throw new Error("Kræver databaseforbindelse");
  // Sørg for at projektrækken findes (demo-projekter lever ellers kun i mock).
  const projekt = await getProject(projektId);
  if (projekt) await saveProject(projekt);
  const { error } = await db
    .from("lavbund_projekter")
    .update({ linked_project_id: coreProjectId })
    .eq("id", projektId);
  if (error && !isMissingTable(error)) throw new Error(error.message);
}

// ─── Målepunkter / readings / transekter / grøfter ───────────────────────────

async function listPayloads<T extends object>(
  table: string,
  projektId: string,
  mockRows: T[],
  orderCol = "id",
): Promise<T[]> {
  const db = client();
  if (db) {
    const { data, error } = await db
      .from(table)
      .select("payload")
      .eq("projekt_id", projektId)
      .order(orderCol);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error && data && data.length > 0) {
      return (data as Array<{ payload: T }>).map((r) => ({ ...r.payload }));
    }
  }
  return mockRows.map((r) => ({ ...r }));
}

export async function getMaalepunkter(projektId: string): Promise<Maalepunkt[]> {
  return listPayloads(
    "lavbund_maalepunkter",
    projektId,
    MOCK_MAALEPUNKTER.filter((m) => m.projektId === projektId),
  );
}

export async function getReadings(projektId: string): Promise<VandstandsReading[]> {
  const mpIds = new Set(
    MOCK_MAALEPUNKTER.filter((m) => m.projektId === projektId).map((m) => m.id),
  );
  return listPayloads(
    "lavbund_readings",
    projektId,
    MOCK_READINGS.filter((r) => mpIds.has(r.maalepunktId)),
  );
}

export async function getTransekter(projektId: string): Promise<Transekt[]> {
  return listPayloads(
    "lavbund_transekter",
    projektId,
    MOCK_TRANSEKTER.filter((t) => t.projektId === projektId),
  );
}

export async function getGroefter(projektId: string): Promise<GroeftStraekning[]> {
  return listPayloads(
    "lavbund_groefter",
    projektId,
    MOCK_GROEFTER.filter((g) => g.projektId === projektId),
  );
}

// ─── Skrive-veje: målepunkter, pejlinger, transekter, grøfter ─────────────────

/** Sørg for at projektrækken findes i DB (mock-demo-projekter oprettes on-demand). */
async function ensureProjectRow(projektId: string): Promise<boolean> {
  const db = client();
  if (!db) return false;
  const { data } = await db
    .from("lavbund_projekter")
    .select("id")
    .eq("id", projektId)
    .maybeSingle();
  if ((data as { id: string } | null)?.id) return true;
  const projekt = await getProject(projektId);
  if (!projekt) return false;
  const { error } = await db.from("lavbund_projekter").upsert(
    [{ id: projekt.id, navn: projekt.navn, status: projekt.status, payload: projekt, updated_at: new Date().toISOString() }],
    { onConflict: "id" },
  );
  return !error;
}

export async function saveMaalepunkt(m: Maalepunkt): Promise<Maalepunkt> {
  const db = client();
  if (db && (await ensureProjectRow(m.projektId))) {
    const { error } = await db.from("lavbund_maalepunkter").upsert(
      [{ id: m.id, projekt_id: m.projektId, payload: m }],
      { onConflict: "id" },
    );
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error) return m;
  }
  MOCK_MAALEPUNKTER.push(m);
  return m;
}

export async function saveReading(projektId: string, r: VandstandsReading): Promise<VandstandsReading> {
  const db = client();
  if (db && (await ensureProjectRow(projektId))) {
    const { error } = await db.from("lavbund_readings").insert([
      { projekt_id: projektId, maalepunkt_id: r.maalepunktId, tidspunkt: r.tidspunkt, payload: r },
    ]);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error) return r;
  }
  MOCK_READINGS.push(r);
  return r;
}

/** Erstat projektets transekter med den redigerede liste (fosfor-editoren). */
export async function replaceTransekter(projektId: string, list: Transekt[]): Promise<void> {
  const db = client();
  if (db && (await ensureProjectRow(projektId))) {
    const del = await db.from("lavbund_transekter").delete().eq("projekt_id", projektId);
    if (del.error && !isMissingTable(del.error)) throw new Error(del.error.message);
    if (!del.error && list.length > 0) {
      const { error } = await db.from("lavbund_transekter").insert(
        list.map((t) => ({ projekt_id: projektId, nr: t.nr, fase: t.fase, payload: t })),
      );
      if (error) throw new Error(error.message);
    }
    if (!del.error) return;
  }
  // Mock-fallback: filtrér gamle ud og læg nye ind.
  for (let i = MOCK_TRANSEKTER.length - 1; i >= 0; i--) {
    if (MOCK_TRANSEKTER[i].projektId === projektId) MOCK_TRANSEKTER.splice(i, 1);
  }
  MOCK_TRANSEKTER.push(...list);
}

/** Erstat projektets grøftestrækninger med den redigerede liste. */
export async function replaceGroefter(projektId: string, list: GroeftStraekning[]): Promise<void> {
  const db = client();
  if (db && (await ensureProjectRow(projektId))) {
    const del = await db.from("lavbund_groefter").delete().eq("projekt_id", projektId);
    if (del.error && !isMissingTable(del.error)) throw new Error(del.error.message);
    if (!del.error && list.length > 0) {
      const { error } = await db.from("lavbund_groefter").insert(
        list.map((g) => ({ id: g.id, projekt_id: projektId, payload: g })),
      );
      if (error) throw new Error(error.message);
    }
    if (!del.error) return;
  }
  for (let i = MOCK_GROEFTER.length - 1; i >= 0; i--) {
    if (MOCK_GROEFTER[i].projektId === projektId) MOCK_GROEFTER.splice(i, 1);
  }
  MOCK_GROEFTER.push(...list);
}

// ─── Ledger ───────────────────────────────────────────────────────────────────

export async function getLedger(projektId: string): Promise<LedgerPost[]> {
  const db = client();
  if (db) {
    const { data, error } = await db
      .from("lavbund_ledger")
      .select("payload")
      .eq("projekt_id", projektId)
      .order("seq", { ascending: true });
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error && data && data.length > 0) {
      return (data as Array<{ payload: LedgerPost }>).map((r) => ({ ...r.payload }));
    }
  }
  return (MOCK_LEDGER[projektId] ?? []).slice();
}

export async function appendLedger(projektId: string, post: LedgerPost): Promise<LedgerPost> {
  const db = client();
  if (db && (await ensureProjectRow(projektId))) {
    const { error } = await db
      .from("lavbund_ledger")
      .insert([{ projekt_id: projektId, seq: post.seq, payload: post }]);
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error) return post;
  }
  if (!MOCK_LEDGER[projektId]) MOCK_LEDGER[projektId] = [];
  MOCK_LEDGER[projektId].push(post);
  return post;
}

// ─── Snapshots + indicator-kobling ────────────────────────────────────────────

export async function getSnapshot(projektId: string): Promise<BeregningsSnapshot | null> {
  const db = client();
  if (db) {
    const { data, error } = await db
      .from("lavbund_snapshots")
      .select("payload")
      .eq("projekt_id", projektId)
      .maybeSingle();
    if (error && !isMissingTable(error)) throw new Error(error.message);
    const row = data as { payload: BeregningsSnapshot } | null;
    if (!error && row) return { ...row.payload };
  }
  return MOCK_SNAPSHOTS[projektId] ?? null;
}

export async function saveSnapshot(s: BeregningsSnapshot): Promise<BeregningsSnapshot> {
  const db = client();
  if (db && (await ensureProjectRow(s.projektId))) {
    const { error } = await db.from("lavbund_snapshots").upsert(
      [{ projekt_id: s.projektId, payload: s, updated_at: new Date().toISOString() }],
      { onConflict: "projekt_id" },
    );
    if (error && !isMissingTable(error)) throw new Error(error.message);
    if (!error) {
      await syncSnapshotToIndicators(s).catch(() => undefined); // best-effort
      return s;
    }
  }
  MOCK_SNAPSHOTS[s.projektId] = s;
  return s;
}

/** Byg indicator-rækken som et snapshot føder ind i kerneprojektets dashboard. */
export function buildCo2Indicator(
  linkedProjectId: string,
  snapshot: BeregningsSnapshot,
): {
  project_id: string;
  key: string;
  label: string;
  value: number;
  unit: string;
  trend: string;
  updated_at: string;
} {
  return {
    project_id: linkedProjectId,
    key: "co2e_reduced",
    label: "CO₂e reduceret (verificeret)",
    value: Math.round(snapshot.co2.verificeretTotal * 100) / 100,
    unit: "t CO₂e/år",
    trend: "flat",
    updated_at: new Date().toISOString(),
  };
}

/**
 * Er lavbundsprojektet koblet til et kerneprojekt (linked_project_id), skubbes
 * den verificerede CO₂-effekt ind i projektets co2e_reduced-indicator, så
 * dashboardet viser den officielle v12-beregning frem for kun IPCC-estimatet.
 */
async function syncSnapshotToIndicators(s: BeregningsSnapshot): Promise<void> {
  const db = client();
  if (!db) return;
  const { data } = await db
    .from("lavbund_projekter")
    .select("linked_project_id")
    .eq("id", s.projektId)
    .maybeSingle();
  const linked = (data as { linked_project_id: string | null } | null)?.linked_project_id;
  if (!linked) return;
  await db
    .from("indicators")
    .upsert([buildCo2Indicator(linked, s)], { onConflict: "project_id,key" });
}

// ─── DecisionsIQ-anbefalinger ────────────────────────────────────────────────

/** Regelbaserede anbefalinger ud fra projektets tilstand. */
export async function getAnbefalinger(projektId: string): Promise<string[]> {
  const p = await getProject(projektId);
  if (!p) return [];
  const anb: string[] = [];
  if (p.afvigelser.some((a) => a.aaben))
    anb.push("Åben afvigelse — supplerende grøftelukning eller pumpestop anbefales.");
  const antalTiltag = Object.values(p.tiltag).filter(Boolean).length;
  if (antalTiltag < 2)
    anb.push("Overvej at kombinere mindst to hydrologiske tiltag for robust vådlægning.");
  return anb;
}
