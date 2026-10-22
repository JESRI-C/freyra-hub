# Naturprojekter — Testplan

Sidst opdateret: 2026-07-05

Kør efter hver fase. Resultater føres nederst.

## Enhedstest (Vitest)

Pr. fase:
- Fase 1: `projects-service.updateProjectStatus`, `getRecommendedNextAction`
  udvidelser
- Fase 2: `sites-service.createSite/updateSite/archiveSite`, geometri-parsing
- Fase 3: `data-sources-service.triggerSync/testConnection`, run-log write
- Fase 4: `indicator-measurements.getSeries`, threshold-evaluering
- Fase 5: `actions-service.completeWithEvidence`
- Fase 6: `document-generator.generateStatusReport` returnerer valid PDF-bytes
- Fase 7: `project-media-service` med tags-filtre
- Fase 8: audit før/efter-diff
- Fase 9: `has_project_role` policies (via `pgTAP` eller manuelle queries)

## Integrationsflow (manuel eller Playwright)

### Projekt
- [ ] Opret projekt via `/app/projects/new`
- [ ] Redigér projektnavn via ny dialog → optræder i header + audit
- [ ] Ændr status til "Aktiv" fra header → optræder i audit
- [ ] Klik "3 sites" i header → åbner Sites-fanen

### Sites
- [ ] Opret site manuelt
- [ ] Opret site fra matrikel via kort
- [ ] Opret site via GeoJSON-upload
- [ ] Redigér site
- [ ] Arkivér + gendan

### Kort
- [ ] Adressesøgning finder Tvedvej 12, Silkeborg
- [ ] Tegn polygon med 5 punkter (afsluttes ikke automatisk)
- [ ] Redigér polygon-punkter
- [ ] Version gemmes, tidligere version ses i audit

### Datakilder
- [ ] Wizard opret upload → CSV preview → import
- [ ] Sync-log viser success
- [ ] Fejl-scenarie viser rigtig fejl
- [ ] Kobling til indikator vises på kildekortet

### Indikatorer
- [ ] Klik KPI-kort → detalje-drawer med graf
- [ ] Skift periode → graf opdateres
- [ ] Ingen data → viser "Ikke beregnet endnu"
- [ ] Overskrid threshold → automatisk handling oprettes

### Handlinger
- [ ] Opret handling med bevis-krav
- [ ] Prøv afslut uden bevis → blokeres
- [ ] Vedhæft foto → afsluttes, audit-event skrives
- [ ] Filtrér efter site + status

### Audit
- [ ] Filtrér efter dato + type
- [ ] Se før/efter for projektgrænse-ændring
- [ ] Eksportér til CSV

### Dokumentation
- [ ] Upload PDF
- [ ] Generér projektstatusrapport → PDF downloades
- [ ] Dokumentationsscore falder når foto mangler
- [ ] Klik "mangler" → åbner den relevante fane

### Medier
- [ ] Upload med GPS → placeres på kort
- [ ] Tilføj tag + kobl til handling
- [ ] Opret før/efter-sammenligning
- [ ] Slet med bekræftelse

### Roller
- [ ] Viewer kan ikke redigere handling (knap disabled + RLS-fejl hvis omgået)
- [ ] Field kan opdatere egne handlinger
- [ ] Ekstern partner ser kun godkendte dokumenter

## Mobil

- [ ] Faner scrollbare vandret
- [ ] Sites-tabel bliver til kort
- [ ] Upload fra kamera på mobil
- [ ] Kort virker med touch (pinch/zoom, tegning)

## Resultater

| Fase | Kørt dato | Ansvarlig | Bestået | Noter |
|------|-----------|-----------|---------|-------|
| 1    |           |           |         |       |
| 2    |           |           |         |       |
| 3    |           |           |         |       |
| 4    |           |           |         |       |
| 5    |           |           |         |       |
| 6    |           |           |         |       |
| 7    |           |           |         |       |
| 8    |           |           |         |       |
| 9    |           |           |         |       |
| 10   |           |           |         |       |
