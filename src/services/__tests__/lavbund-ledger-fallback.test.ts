import { describe, expect, it, vi } from "vitest";

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

describe("lavbund ledger fallback conflicts", () => {
  it("treats an identical post as an idempotent retry", async () => {
    const projectId = `ledger-idempotent-${crypto.randomUUID()}`;
    const original = ledgerPost("same-hash");

    await appendLedger(projectId, original);
    const retried = await appendLedger(projectId, { ...original });

    expect(retried).toEqual(original);
    expect(await getLedger(projectId)).toEqual([original]);
  });

  it("rejects the same seq and hash when another field differs", async () => {
    const projectId = `ledger-payload-conflict-${crypto.randomUUID()}`;
    const original = ledgerPost("same-hash");

    await appendLedger(projectId, original);

    await expect(
      appendLedger(projectId, { ...original, detail: "Manipulated detail" }),
    ).rejects.toThrow(
      `Ledger conflict for project "${projectId}" at seq 7: existing post differs from incoming post.`,
    );
    expect(await getLedger(projectId)).toEqual([original]);
  });

  it("rejects the same seq with a different hash and preserves the stored post", async () => {
    const projectId = `ledger-conflict-${crypto.randomUUID()}`;
    const original = ledgerPost("stored-hash");

    await appendLedger(projectId, original);

    await expect(appendLedger(projectId, ledgerPost("incoming-hash"))).rejects.toThrow(
      `Ledger conflict for project "${projectId}" at seq 7: existing post differs from incoming post.`,
    );
    expect(await getLedger(projectId)).toEqual([original]);
  });
});
