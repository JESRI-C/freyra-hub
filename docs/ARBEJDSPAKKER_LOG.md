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

## F04

- Dokumenteret genbrug: append-only workspace-versioner med advisory lock,
  aktør/tid fastlagt i DB, versionskonflikter og immutable rapportinput.
  Separate rapportspor og reviewmodeller bevares.
- Prøver: report-document/service, project-workspace, municipal-report-replay,
  municipal-report-inputs og municipal-report-authorization. Historiske v1/v2
  manifest-, PDF- og ZIP-bytes prøves uændret efter nye generatorer.
- Ny kørsel af upload/metadata/round/report: 144 tests bestået; én bundleprøve
  overskred 15 sekunder. Præcis den prøve genkørt isoleret med 60 sekunders
  tidsgrænse bestod på 2,32 sekunder. Fejlen er ikke skjult som en grøn første
  kørsel. Yderligere 200 tests i syv filer består.
- Status: delvist dækket. Udførelsesrevisionens kobling til sammenligning er
  konkret restarbejde i F07/F08. Ingen migration tilføjet. Næste: F05.

## F05

- Dokumenteret genbrug: originalmetadata, SHA-256, scoped private medier,
  resumable upload-intents/finalize og dronebatch. Ændrede bytes er en ny kilde.
- Prøver: project-media-originals, drone-ingest, drone-image-metadata,
  uploads-service-security og supabase-upload-intents-migration består i de
  ovenstående kørsler (bundle-timeout og isoleret genprøve er angivet under F04).
- Ingen filgrænse er ændret uden et konkret behov; kundens aftalte filantal
  og typer er ikke udledt af testfixtures.
- Status: delvist dækket. Fuld batch med faktiske kundetyper, afbrudt net,
  genoptagelse og genhentning i hosted Storage er ikke afprøvet på ny.
  Næste: F06.

## F06

- Dokumenteret genbrug: baseline-snapshots, verification-plan-versioner,
  survey-round-versioner og deres medietilknytning; ingen parallel besøgstabel.
- Prøver: survey-round-persistence, verification-plan-persistence,
  survey-round-media-persistence, collect-public-baseline og round/media-auth
  består. De afviser ændret kildehash, falsk godkendelse, baglæns periode og
  fremmede projekter; genåbning bruger det gemte grundlag.
- Status: delvist dækket. En registreret undersøgelse er ikke automatisk
  tilstrækkelig dækning. Faktisk dækning og udførelseskobling skal fremgå
  eksplicit i de følgende pakker. Rigtig førserie og feltaccept er ikke
  afprøvet. Næste: F07, struktureret faktisk udførelse.

## F07

- Ændring: action-execution-kontrakt og scoped service kobler faktisk
  udførelse til eksisterende actions, survey_round_versions og evidence_files.
  Uforanderlige decision_note-versioner genbruges; ingen ny tabel/migration.
  Stabil entry_id fra handlingen gør samtidige første gemninger til konflikt
  frem for to udførelsesspor. Rettelser kræver årsag og bruger den åbnede
  version, så baggrundsopdateringer ikke skjult overskriver nyere ændringer.
- Brugerflade: Udførelse-trin med valg/oprettelse af handling, faktisk
  dato/periode, metode, udfører, delstrækning, bilag, afvigelser og dækning.
  Ukendt metode forbliver null. Planlagte handlinger får ingen faktisk dato.
- Filer: action-execution.ts, action-execution-service.ts,
  ActionExecutionPanel.tsx, project-workspace-service.ts,
  MunicipalCaseWorkspace.tsx og to nye testfiler.
- Prøver: 12 tests i tre filer består, herunder manglende/fremmed handling,
  fremmed bilag/besøg, ugyldige datoer, rettelsesårsag og stabil identitet.
  Typekontrol fandt nullable organisationsreference; panelet åbnes nu kun med
  en kendt organisationsreference. Endelig type-/UI-kontrol følger.
- Status: under udvikling indtil den samlede UI-/versionsprøve. Faktisk
  kundeskæring er ikke afprøvet. Næste: F08, versionsbundet sammenligning.

## F08

- Ændring: struktureret fotopar med præcis udførelsesrevision og to private
  originalreferencer. Samme sted, fælles dækning, udeladte områder,
  optageforskelle og begrænsninger følger den immutable sammenligningsversion.
- En nyere udførelsesversion viser genvurderingsbehov. Planlagt indsats,
  manglende optagetid/kontrolsum, samme original og utilstrækkelig dækning
  bliver ikke et dokumenteret før/efter-resultat. Utilstrækkeligt materiale
  kan stadig gemmes som begrænset kladde.
- Filer: photo-comparison.ts, photo-comparison-service.ts,
  PhotoComparisonPanel.tsx, MunicipalCaseWorkspace.tsx og to testfiler.
- Prøver: 11 tests i to filer består (forkert/manglende grundlag, fremmed
  udførelse, utilgængelige originaler, versionsskift, skjulte arealer og
  forbudt kvantitativ måling). Typecheck efter F07/F08 består.
- Status: delvist dækket; ny hosted mobil-/browserprøve og rigtig kundeserie
  er ikke afprøvet. Ingen præcis arealmotor aktiveret. Næste: F09.

## F09

- Ændring: kerneforløbet går fra dokumenteret udførelse og sammenligning til
  rapport uden obligatorisk plantning. Beplantning er stadig synlig som valgfri
  funktion og beholder sit eksisterende link. Ingen faglige kategorier fjernet.
- Billedsammenligning har nu en navngiven native skyder med tastaturbetjening,
  label og aflæselig fordeling. Formularer bruger labels og særskilte fejl/status.
- Prøver: fire navigation-/DOM-interaktionstests består. De tester blandt
  andet levering uden plantning, historisk plantelink, fokusérbar skyder og
  ændret visuelt split via input. Dette er ikke hosted mobil- eller WCAG-accept.
- Status: delvist dækket. Telefon-/desktop-browser, fokusforløb og reel
  medarbejders forståelse er ikke afprøvet. Næste: F10, frosset aflevering.
