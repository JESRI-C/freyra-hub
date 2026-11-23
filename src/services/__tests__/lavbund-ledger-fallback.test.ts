import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/data-mode", () => ({
  isDemoDataEnabled: true,
  requireCustomerDatabase: vi.fn(() => {
    throw new Error("Offline-demo må ikke kræve kundedatabase");
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: null,
  isSupabaseConfigured: false,
  getSupabaseClient: () => null,
}));

import { appendLedger, getLedger } from "@/services/lavbundService";
import type { LedgerPost } from "@/types/lavbund";

function ledgerPost(hash: string): LedgerPost {
  return {
    seq: 7,
    tidspunkt: "2026-08-29T12:00:00.000Z",
    actor: "test-user",
    event: "measurement.recorded",
    detail: "Focused fallback test",
    prevHash: "previous-hash",
    hash,
  };
}

describe("customer ledger never claims offline persistence", () => {
  it.each(["same-hash", "incoming-hash", "stored-hash"])(
    "rejects %s without a database",
    async (hash) => {
      const id = "offline-" + crypto.randomUUID();
      await expect(appendLedger(id, ledgerPost(hash))).rejects.toThrow();
      await expect(getLedger(id)).rejects.toThrow();
    },
  );
});
