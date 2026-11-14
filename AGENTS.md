# AGENTS.md

- Project report PDFs (status, indicator, authority) are rendered only by `src/services/project-report-pdf.ts`; `documents-service.ts` keeps storage/audit. Why: one shared A4 brand layout for all report types.
- PDF brand assets and fonts live in `src/assets/pdf/` and are inlined with `?inline`. Why: PDF generation must make no runtime network requests.
