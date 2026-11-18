import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrations = [
  {
    file: "20260527044453_1e15f28f-99c6-4c96-a96f-be05fd8125d4.sql",
    signatures: ["public.enqueue_email(text,jsonb)", "public.delete_email(text,bigint)"],
  },
  {
    file: "20260605055602_6ed2c4da-47af-4660-8c19-ddeade8ab4df.sql",
    signatures: [
      "public.move_to_dlq(text,text,bigint,jsonb)",
      "public.read_email_batch(text,integer,integer)",
    ],
  },
].map((entry) => ({
  ...entry,
  sql: readFileSync(resolve(process.cwd(), "supabase/migrations", entry.file), "utf8")
    .replace(/--[^\r\n]*/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim(),
}));

describe("optional hosted email helpers during fresh migration replay", () => {
  for (const { file, signatures, sql } of migrations) {
    it.each(signatures)(
      `${file}: %s is hardened only when its exact overload exists`,
      (signature) => {
        const compactSql = sql.replace(/, /g, ",");
        const branchStart = compactSql.indexOf(
          `if pg_catalog.to_regprocedure('${signature}') is not null then`,
        );
        expect(branchStart).toBeGreaterThanOrEqual(0);
        const branchEnd = compactSql.indexOf("end if;", branchStart);
        expect(branchEnd).toBeGreaterThan(branchStart);
        const branch = compactSql.slice(branchStart, branchEnd);
        expect(branch).toContain(
          `execute 'revoke execute on function ${signature} from public,anon,authenticated'`,
        );
        expect(branch).toContain(
          `execute 'alter function ${signature} set search_path = public,pgmq'`,
        );
        // Unconditional copies would still fail before this guard on a fresh DB.
        expect(compactSql.split(`on function ${signature}`).length - 1).toBe(1);
        expect(compactSql.split(`alter function ${signature}`).length - 1).toBe(1);
      },
    );

    it(`${file}: preserves real errors and does not provision or expose queue stubs`, () => {
      expect(sql).not.toMatch(/create (?:or replace )?function/);
      expect(sql).not.toMatch(/grant execute|exception when others|when undefined_function/);
    });
  }
});
