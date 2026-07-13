// Service-lag for LavbundsMRV. UI-komponenter kalder KUN disse funktioner.
// I dag læser vi fra in-memory mock-data; signaturerne er klar til API/DB.
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

const LATENCY = 300;

function delay<T>(v: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), LATENCY));
}

// Simpelt in-memory lager (mock).
const projekter: LavbundsProjekt[] = MOCK_PROJEKTER.map((p) => ({ ...p }));

export async function getProjects(): Promise<LavbundsProjekt[]> {
  return delay(projekter.map((p) => ({ ...p })));
}

export async function getProject(id: string): Promise<LavbundsProjekt | null> {
  const p = projekter.find((x) => x.id === id) ?? null;
  return delay(p ? { ...p } : null);
}

export async function saveProject(p: LavbundsProjekt): Promise<LavbundsProjekt> {
  const i = projekter.findIndex((x) => x.id === p.id);
  if (i >= 0) projekter[i] = { ...p };
  else projekter.push({ ...p });
  return delay({ ...p });
}

export async function getMaalepunkter(projektId: string): Promise<Maalepunkt[]> {
  return delay(MOCK_MAALEPUNKTER.filter((m) => m.projektId === projektId));
}

export async function getReadings(projektId: string): Promise<VandstandsReading[]> {
  const mpIds = new Set(
    MOCK_MAALEPUNKTER.filter((m) => m.projektId === projektId).map((m) => m.id),
  );
  return delay(MOCK_READINGS.filter((r) => mpIds.has(r.maalepunktId)));
}

export async function getTransekter(projektId: string): Promise<Transekt[]> {
  return delay(MOCK_TRANSEKTER.filter((t) => t.projektId === projektId));
}

export async function getGroefter(projektId: string): Promise<GroeftStraekning[]> {
  return delay(MOCK_GROEFTER.filter((g) => g.projektId === projektId));
}

export async function getLedger(projektId: string): Promise<LedgerPost[]> {
  return delay((MOCK_LEDGER[projektId] ?? []).slice());
}

export async function appendLedger(
  projektId: string,
  post: LedgerPost,
): Promise<LedgerPost> {
  if (!MOCK_LEDGER[projektId]) MOCK_LEDGER[projektId] = [];
  MOCK_LEDGER[projektId].push(post);
  return delay(post);
}

export async function getSnapshot(
  projektId: string,
): Promise<BeregningsSnapshot | null> {
  return delay(MOCK_SNAPSHOTS[projektId] ?? null);
}

export async function saveSnapshot(s: BeregningsSnapshot): Promise<BeregningsSnapshot> {
  MOCK_SNAPSHOTS[s.projektId] = s;
  return delay(s);
}

/** DecisionsIQ-hook (stub). Returnerer regelbaserede anbefalinger. */
export async function getAnbefalinger(projektId: string): Promise<string[]> {
  const p = projekter.find((x) => x.id === projektId);
  if (!p) return delay([]);
  const anb: string[] = [];
  if (p.afvigelser.some((a) => a.aaben))
    anb.push(
      "Åben afvigelse — supplerende grøftelukning eller pumpestop anbefales.",
    );
  const antalTiltag = Object.values(p.tiltag).filter(Boolean).length;
  if (antalTiltag < 2)
    anb.push("Overvej at kombinere mindst to hydrologiske tiltag for robust vådlægning.");
  return delay(anb);
}
