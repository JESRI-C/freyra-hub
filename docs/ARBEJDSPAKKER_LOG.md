# Arbejdspakkelog

Ingen kunde-/faglig pilotaccept er registreret. Alle nye prøver bruger
syntetiske fixtures lokalt. Ingen mail, deploy eller produktionsændring.
Basiskode: b39ffbc; arbejdsgren: codex/bykaer-pilot-v1.

## F00

- Ændring/genbrug: afstemt hovedgren, PR18, PR19, separate checkouts,
  eksisterende instruktioner, CI, versionsmodeller og migrationsledger.
  Ingen AGENTS.md fundet i de undersøgte projektmapper.
- Filer: README, .lovable/plan.md, HADERSLEV_PLAN_2026-11-10.md,
  F00_AFSTEMNING.md og PAKKESTATUS.md. Commit f6848d6.
- Prøver: staging-preflight og typecheck består; lint 0 fejl/24 eksisterende
  advarsler; 45 målrettede atlas/rapport/drone-tests og 135 basisregressioner
  består. 79 eksisterende offline PostgreSQL/RLS-assertions består.
- Miljø: staging ledger læst read-only: 30 migrationer, seneste 20261027223941.
  Aktuelt hosted appbuild og produktionsrevision kunne ikke identificeres.
- Status: lokal afstemning dækket og verificeret; hosted afventer ekstern
  afprøvning. Næste: F01.

## F01

- Genbrug: dedikeret serverauth, scoped ingest, eksisterende tenant-hardening,
  projektroller og restrictive releasepolicies. Ingen ny rollemodel.
- Ændring: offline RLS-harness prøver nu tilbagekaldelse ved nye forespørgsler
  til rapporter, geometri, observationer, filer og workspace samt selvvalgt admin.
- URL-begrænsning: generelle medier og evidenslinks lever 5 minutter;
  droneoriginalens særskilte flow 60 sekunder. Tilbagekaldelse stopper nye
  autoriserede opslag; allerede udstedt bearer-URL kan leve til udløb.
- Prøver: se efterfølgende resultatlinje. Harness er en afgrænset PostgreSQL-
  fixture, ikke fuld Supabase-migrationsreplay eller hosted Storage-byteprøve.
- Status: delvist dækket. Live tilbagekaldelse, browserbundle og selvbetjening
  med faktisk medarbejderrolle afventer ekstern afprøvning. Næste: F02.

Resultat F01: **87 PostgreSQL/RLS-assertions bestået**; serverauth og
tenant-regression indgår i de 135 beståede basisprøver. Commit 58aeb9c.

## F02

- Dokumenteret genbrug: ProjectContextBoundary, resolveProjectSelection,
  auth-cache/projektvalg, scoped workspace og watercourse-versioner.
- Prøver: auth-query-cache, auth-project-selection, watercourse-geometry og
  project-workspace-service indgår i de 135 beståede basisprøver. DB-harness
  kontrollerer separat projektadgang og immutable geometri.
- Konkret kodefund: utilgængeligt projekt giver eksplicit fejl, ikke første
  projekt som fallback; projektcache og geometri forbliver versionsafgrænsede.
- Status: lokalt dokumenteret genbrug; samlet pakke delvist dækket.
  Hosted refresh/hurtige projektskift er ikke afprøvet. Næste: F03.

## F03

- Dokumenteret genbrug: data-mode/demo-mode og customer-source-integrity.
  Ukendt flag eller manglende database aktiverer ikke eksempeldata. Historisk
  offlinefallback afvises. readiness bruges ikke som ubekræftet kvalitetsscore.
- Prøver: data-mode/demo-mode i de 135 basisprøver; customer-source-integrity
  indgår i den nye 200-tests-kørsel sammen med upload/baseline/round-auth.
- Ingen produktændring nødvendig i denne afgrænsning.
- Status: delvist dækket; tom kundesag og eksport på hosted release er
  ikke afprøvet på ny. Næste: F04.
