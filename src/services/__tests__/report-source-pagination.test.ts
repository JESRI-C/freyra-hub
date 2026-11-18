import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: mocks }));
import { loadReportSources } from "../report-document-service";

type Page = { data: unknown; count: number | null; error: { message: string } | null };
const file = (id: string) => ({
  id,
  title: id,
  evidence_type: "document",
  created_at: "2026-11-18T00:00:00Z",
});
const page = (data: unknown[], count = data.length): Page => ({ data, count, error: null });
function query(pages: Page[]) {
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn(),
  };
  for (const result of pages) q.range.mockResolvedValueOnce(result);
  q.range.mockRejectedValue(new Error("Unexpected extra page"));
  return q;
}
function setup(pages: Page[]) {
  const media = query([page([])]);
  const files = query(pages);
  mocks.from.mockImplementation((table: string) => (table === "evidence_files" ? files : media));
  return { media, files };
}
describe("complete report source retrieval", () => {
  beforeEach(() => vi.resetAllMocks());
  it("continues after a short server page and retains every source in order", async () => {
    const { files, media } = setup([page([file("a"), file("b")], 3), page([file("c")], 3)]);
    expect((await loadReportSources("case-a")).map((source) => source.id)).toEqual([
      "evidence:a",
      "evidence:b",
      "evidence:c",
    ]);
    expect(files.range.mock.calls).toEqual([
      [0, 499],
      [2, 501],
    ]);
    for (const q of [media, files]) {
      expect(q.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
      expect(q.eq).toHaveBeenCalledWith("project_id", "case-a");
      expect(q.order).toHaveBeenCalledWith("id");
    }
  });
  it("accepts an explicitly empty register", async () => {
    const { files } = setup([page([])]);
    expect(await loadReportSources("case-a")).toEqual([]);
    expect(files.range).toHaveBeenCalledTimes(1);
  });
  it.each([
    [page([file("a")], 2), page([], 2)],
    [page([file("a")], 2), page([file("a")], 2)],
    [page([file("a")], 2), page([file("b")], 3)],
    [page([file("a")], 2), page([file("b")], 1)],
    [page([file("a"), file("a")], 2)],
    [page([file("a"), file("b")], 1)],
    [{ ...page([file("a")]), count: null }],
    [{ ...page([file("a")]), count: -1 }],
    [{ ...page([file("a")]), count: 0.5 }],
    [{ ...page([]), data: null }],
    [page([{ title: "Missing source identity" }])],
  ])(
    "rejects inconsistent or incomplete pages instead of returning a partial register (%#)",
    async (...pages) => {
      setup(pages as Page[]);
      await expect(loadReportSources("case-a")).rejects.toThrow(
        "Kilderegisteret er ændret eller ufuldstændigt",
      );
    },
  );
  it("propagates a later server denial without exposing the first page as a result", async () => {
    setup([
      page([file("a")], 2),
      { data: null, count: null, error: { message: "permission denied" } },
    ]);
    await expect(loadReportSources("case-a")).rejects.toThrow("permission denied");
  });
});
