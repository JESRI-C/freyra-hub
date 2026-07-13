// Generisk ESG Ledger — append-only hændelseslog med SHA-256-kæde.
// Kan bruges af flere moduler (module-parameter). LavbundsMRV skriver hertil.
//
// Persistens: lavbund-modulets poster skrives igennem til Supabase-tabellen
// lavbund_ledger (via lavbundService) med in-memory som cache/fallback, så
// revisionssporet overlever genindlæsning. Andre moduler kører in-memory
// indtil de får egne tabeller.
import type { LedgerPost } from "@/types/lavbund";
import { getLedger as dbGetLedger, appendLedger as dbAppendLedger } from "@/services/lavbundService";

const store = new Map<string, LedgerPost[]>();

function key(modul: string, sagId: string): string {
  return `${modul}::${sagId}`;
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hashInput(prev: string, tid: string, actor: string, event: string, detail: string) {
  return `${prev}|${tid}|${actor}|${event}|${detail}`;
}

/** Hent posterne — for lavbund fra databasen (og prime cachen), ellers memory. */
async function loadRows(modul: string, sagId: string): Promise<LedgerPost[]> {
  if (modul === "lavbund") {
    try {
      const dbRows = await dbGetLedger(sagId);
      if (dbRows.length > 0) {
        store.set(key(modul, sagId), dbRows);
        return dbRows.slice();
      }
    } catch {
      // DB utilgængelig — brug memory
    }
  }
  return (store.get(key(modul, sagId)) ?? []).slice();
}

export async function ledgerList(modul: string, sagId: string): Promise<LedgerPost[]> {
  return loadRows(modul, sagId);
}

export async function ledgerAppend(
  modul: string,
  sagId: string,
  input: { actor: string; event: string; detail: string; tidspunkt?: string },
): Promise<LedgerPost> {
  const rows = await loadRows(modul, sagId);
  const prev = rows[rows.length - 1];
  const prevHash = prev?.hash ?? "GENESIS";
  const tid = input.tidspunkt ?? new Date().toISOString();
  const hash = await sha256Hex(hashInput(prevHash, tid, input.actor, input.event, input.detail));
  const post: LedgerPost = {
    seq: rows.length + 1,
    tidspunkt: tid,
    actor: input.actor,
    event: input.event,
    detail: input.detail,
    prevHash,
    hash,
  };
  rows.push(post);
  store.set(key(modul, sagId), rows);
  if (modul === "lavbund") {
    // Best-effort persistens af HELE kæden (idempotent — unique(projekt_id,seq)
    // afviser dubletter), så demo-historik fra mock også lander i databasen og
    // kæden verificerer efter genindlæsning.
    for (const r of rows) {
      await dbAppendLedger(sagId, r).catch(() => undefined);
    }
  }
  return post;
}

export interface KaedeResultat {
  ok: boolean;
  brud?: { seq: number; forventet: string; faktisk: string };
}

export async function ledgerVerify(modul: string, sagId: string): Promise<KaedeResultat> {
  const rows = await loadRows(modul, sagId);
  let prev = "GENESIS";
  for (const p of rows) {
    if (p.prevHash !== prev) {
      return { ok: false, brud: { seq: p.seq, forventet: prev, faktisk: p.prevHash } };
    }
    const forventet = await sha256Hex(
      hashInput(prev, p.tidspunkt, p.actor, p.event, p.detail),
    );
    if (forventet !== p.hash) {
      return { ok: false, brud: { seq: p.seq, forventet, faktisk: p.hash } };
    }
    prev = p.hash;
  }
  return { ok: true };
}

/** Kun til dev-mode demo: manipuler en post uden at genberegne hash. */
export function _debugManipuler(modul: string, sagId: string, seq: number): boolean {
  const rows = store.get(key(modul, sagId));
  if (!rows) return false;
  const p = rows.find((r) => r.seq === seq);
  if (!p) return false;
  p.detail = p.detail + " [MANIPULERET]";
  return true;
}
