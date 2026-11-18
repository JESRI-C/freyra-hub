import { utils, writeFile } from "xlsx";

export function createWorkOrderWorkbook(columns: string[], rows: Record<string, string | null>[]) {
  const sheet = utils.aoa_to_sheet([
    columns,
    ...rows.map((row) => columns.map((column) => row[column])),
  ]);
  const book = utils.book_new();
  utils.book_append_sheet(book, sheet, "Arbejdsordrer");
  return book;
}

export function downloadWorkOrderWorkbook(
  columns: string[],
  rows: Record<string, string | null>[],
) {
  writeFile(createWorkOrderWorkbook(columns, rows), "freyra-arbejdsordrer.xlsx");
}
