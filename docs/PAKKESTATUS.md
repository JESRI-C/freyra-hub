# Teknisk pakkestatus

Grundlag: b39ffbc, arbejdsgren codex/bykaer-pilot-v1. Ingen produktionsudgivelse.
Dette er en kode-/testmapping, ikke en kopi af den private udviklingsreference.
Ingen pakke er accepteret i pilot. Live-/kundeaccept angives særskilt.

| Pakke | Status ved afstemning | Konkret kode/test eller restopgave |
| --- | --- | --- |
| F01 | delvist dækket | server-api-auth.server.ts, project-members-service.ts, hardening og release-reader-migrationer; 135 basisregressioner omfatter auth. Ny DB-/Storage- og tilbagekaldelsesprøve mangler. |
| F02 | delvist dækket | ProjectContextBoundary.tsx, auth-query-cache/auth-project-selection tests, watercourse-service.ts og watercourse-geometry tests. Hosted direkte links og hurtige skift afventer. |
| F03 | delvist dækket | data-mode.ts, demo-mode.ts og deres tests; readiness fejler lukket. Manglende grundlag må ikke blive målt nul. |
| F04 | delvist dækket | report-document-service.ts, project-workspace-service.ts, watercourse-observations.ts og versions-/konflikttests. Indsatsversion og ændringspåvirkning mangler konkret sammenhæng. |
| F05 | delvist dækket | uploads-service.ts, project-media-service.ts, drone-ingest.ts, upload-intents og originals-tests. Aftalt kunde-batch og afbrudt hosted upload afventer. |
| F06 | delvist dækket | survey-round-persistence.ts, verification-plan-persistence.ts, PublicBaselinePanel og SurveyRoundMediaPanel. Kobling til faktisk udførelse/sammenligning skal færdiggøres. |
| F07 | delvist dækket | actions-service.ts/actions/action_evidence samt versionsgemte notater. Struktureret faktisk metode/periode/strækning og genvurdering mangler. |
| F08 | delvist dækket | BeforeAfterCompare.tsx, photo-atlas.ts og watercourse-observations.ts. Parameterbestemt egnethed, synlighed og kildefrosset sammenligning mangler. |
| F09 | delvist dækket | MunicipalCaseWorkspace.tsx, useCaseProgress.ts. Plantning er stadig fast vist trin; udførelse/sammenligning/opfølgning skal være tilgængelig uden at fjerne eksisterende links. |
| F10 | delvist dækket | municipal-report-persistence.ts, municipal-report.functions.ts, municipal-report-package/pdf/replay tests. Nyt udførelses-/sammenligningsgrundlag skal med i frosset version og eksport. |
| F11 | delvist dækket | actions-service.ts, project-workspace-service.ts, quality/alerts og monitoring.evaluate.ts. Idempotente forslag med afvisningshistorik mangler på kerneforløbet. |
| F12 | afventer ekstern afprøvning | haderslev-delivery.spec.ts og hosted acceptance scripts genbruges. Faktisk serie/skærelog, medarbejder med skriveret og faglig deltager kræves; læserkonto og fixtures er ikke pilotaccept. |
| F13 | delvist dækket | verification-plan/survey-round-versioner og media-services; metode-/sæsondækning og offlinekonflikter ikke fuldt vurderet. |
| F14 | afventer ekstern afprøvning | species-id.functions.ts, photo-point-review.functions.ts; provider- og fagligt mærket evaluering mangler. |
| F15 | delvist dækket | planting-services, actions og atlasnotater; oprindelige kohorter/genplantning ikke fuldt vurderet. |
| F16 | delvist dækket | project-workspace scenario/decision_note og risici; pris-/tidshorisontkontrol ikke fuldt vurderet. |
| F17 | delvist dækket | afgrænset projektassistent og AI-authorization tests; handlingsværktøjer og omkostningslofter ikke fuldt vurderet. |
| F18 | afventer ekstern afprøvning | live-data/connectors/dmi-client.ts og baselineadaptere; konkret stations-/periodeaccept mangler. |
| F19 | afventer ekstern afprøvning | geospatial/datafordeler- og officielle kildeadaptere, baselinekilder; aktuelle lagvilkår/dækning skal afprøves konkret. |
| F20 | afventer ekstern afprøvning | observations.ts, sensors-service.ts og monitoring aggregation; reel sensorprofil/kalibrering mangler. |
| F21 | delvist dækket | calculated_metrics, baseline- og rapportversioner; konkret metodeprofil og negative effekt-/enhedsprøver ikke fuldt vurderet. |
| F22 | delvist dækket | project_members, ProjectMembersPanel og workspace; afhænger af pilot, ny overdragelses-/porteføljeprøve mangler. |
| F23 | afventer ekstern afprøvning | release restore-, roles- og alarmscripts; samlet hosted DB+filrestore og konkrete driftsvilkår mangler. |
| F24 | ikke vurderet | Job-/lagringsmetadata findes; dokumenteret aftale, forbrug og leveringsøkonomi skal afstemmes efter pilot. |
| F25 | delvist dækket | CI, staging-preflight, buildmetadata og RELEASE_1_0.md; samlet frigivelsesmandat og pilot mangler. |
| F26 | delvist dækket | lavbund-services, geometri og beregnings-/rapportmodeller; konkret ordning/faseaccept mangler. |
| F27 | delvist dækket | construction-service, nature-contexts, risks og mitigation; konkret projekt-/sæsonaccept mangler. |
| F28 | afventer ekstern afprøvning | drone-jobs-service.ts, drone-processing.ts og rasterkontrakter; reel provider og målenøjagtighed mangler. |
| F29 | afventer ekstern afprøvning | map-export-service.ts, CSV/GeoJSON og eksterne referencer; reel kundesystems-eksport/API og mapping mangler. |

F13–F29 er foreløbigt kortlagt og ikke aktiveret som del af første leverance.
F01–F12 behandles sekventielt med genbrug, konkrete mangler og målrettede prøver.
