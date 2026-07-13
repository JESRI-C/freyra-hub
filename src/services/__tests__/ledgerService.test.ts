import { describe, it, expect } from "vitest";
import {
  ledgerAppend,
  ledgerList,
  ledgerVerify,
  _debugManipuler,
} from "../ledgerService";

function uid(): string {
  return "sag-" + Math.random().toString(36).slice(2, 10);
}

describe("ESG Ledger (SHA-256-kæde)", () => {
  it("append linker prevHash til foregående hash", async () => {
    const sag = uid();
    const a = await ledgerAppend("lavbund", sag, {
      actor: "test",
      event: "e1",
      detail: "d1",
    });
    const b = await ledgerAppend("lavbund", sag, {
      actor: "test",
      event: "e2",
      detail: "d2",
    });
    expect(a.prevHash).toBe("GENESIS");
    expect(b.prevHash).toBe(a.hash);
    const rows = await ledgerList("lavbund", sag);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it("verify=ok når kæden er intakt", async () => {
    const sag = uid();
    for (let i = 0; i < 4; i++) {
      await ledgerAppend("lavbund", sag, {
        actor: "test",
        event: `e${i}`,
        detail: `detail ${i}`,
      });
    }
    const r = await ledgerVerify("lavbund", sag);
    expect(r.ok).toBe(true);
  });

  it("verify fanger manipulation af eksisterende post", async () => {
    const sag = uid();
    for (let i = 0; i < 3; i++) {
      await ledgerAppend("lavbund", sag, {
        actor: "test",
        event: `e${i}`,
        detail: `detail ${i}`,
      });
    }
    const list = await ledgerList("lavbund", sag);
    _debugManipuler("lavbund", sag, list[1].seq);
    const r = await ledgerVerify("lavbund", sag);
    expect(r.ok).toBe(false);
    expect(r.brud?.seq).toBe(list[1].seq);
  });

  it("moduler er isolerede pr. (modul, sagId)", async () => {
    const sag = uid();
    await ledgerAppend("lavbund", sag, { actor: "a", event: "x", detail: "y" });
    const andet = await ledgerList("esg", sag);
    expect(andet).toHaveLength(0);
  });
});
