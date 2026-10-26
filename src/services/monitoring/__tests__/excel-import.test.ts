import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseExcel, suggestMapping, validateTabular } from "../upload-import-service";

describe("customer Excel import with official SheetJS", () => {
  it.each(["xlsx", "xls"] as const)(
    "reads real %s bytes with Danish headers and preserves measured zero",
    async (bookType) => {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          ["Tidspunkt", "Breddegrad", "Længdegrad", "Værdi", "Enhed"],
          ["2026-08-24T06:00:00Z", 55.2, 9.3, 0, "mm"],
          ["2026-08-25T06:00:00Z", 55.2, 9.3, 2.5, "mm"],
        ]),
        "Nedbør",
      );
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([["Anvisninger"], ["Dette ark er ikke observationsdata"]]),
        "Læs mig",
      );
      const bytes = XLSX.write(workbook, { bookType, type: "array" });
      const preview = await parseExcel(new File([bytes], `nedbør.${bookType}`));
      expect(preview.headers).toEqual(["Tidspunkt", "Breddegrad", "Længdegrad", "Værdi", "Enhed"]);
      expect(preview.totalRows).toBe(2);
      expect(preview.rows[0]["Værdi"]).toBe(0);
      expect(preview.rows[1]["Værdi"]).toBe(2.5);
      expect(preview.rows[0]["Tidspunkt"]).toBe("2026-08-24T06:00:00Z");
      const mapping = suggestMapping(preview.headers);
      expect(mapping).toMatchObject({
        timestamp: "Tidspunkt",
        value: "Værdi",
        longitude: "Længdegrad",
      });
      expect(validateTabular(preview, mapping)).toMatchObject({
        validRows: 2,
        invalidRows: 0,
        errors: [],
      });
      expect(preview.errors).toEqual([]);
    },
  );
});
