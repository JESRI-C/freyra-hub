# 4DM Project Monitor — målarkitektur

Status: styrende arbejdsarkitektur, opdateret 2026-09-02. Den beskriver retningen for P0 og ændrer ikke i sig selv live schema eller drift.

## Cyklus 014-addendum

Arkitekturen har nu også en kildetestet, service-role-begrænset reconciliation-protokol for annullerede og udløbne upload-intents: databasen udsteder korte, atomiske leases, mens den autoriserede server sletter præcis den bundne Storage-path via Storage API og kvitterer med samme claim-token. Den fysiske sletning sker aldrig via SQL mod `storage.objects`. Scheduler, live migration, rigtig Auth/Storage/TUS, UI-pause/reload-resume, server-side metadataekstraktion og canonical survey/flight/`drone_assets` er fortsat **AFVENTER**. Ældre gap-tekst nedenfor læses som præ-slice-checkpointet.

## Formål og afgrænsning

4DM Project Monitor er ikke en ny app eller et nyt brand. Det er den sted-, tids- og evidensmæssige orkestrering inde i det eksisterende GoFreyra-projektworkspace. Den bindende rejse er Haderslev Vandløb Før/Efter:

Den domænefaglige afgrænsning for dronebilleder, georeferering, gentagelige surveys og rapportudsagn findes i [Vandløb Før/Efter-metoden](./4dm-watercourse-monitoring-method.md) og er bindende for den tekniske model.

`projektområde → baseline → drone/felt/eksterne data → validering → tidslig sammenligning → måling/review → handling/evidens → versionsfast rapport`

Stacken forbliver TanStack Start/Router/Query, React, TypeScript, Vite, Leaflet/Geoman, Supabase/Postgres/PostGIS/Storage og Vitest. Tung fotogrammetri, ortomosaik, pointcloud og tile-generation hører til i en særskilt worker, hvis P0 senere kræver det; browseren indlæser færdige, dokumenterede afledte leverancer.

## Ejerskab og canonical moduler

| Ansvar             | Canonical udgangspunkt                                                             | Bindende regel                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Projektworkspace   | `/app/projects/$slug`                                                              | Projekt-ID og tenant er scope for al 4DM-data.                                           |
| Projektgeometri    | `projects-service`, `geo-service`, `MapEditorMap`, `useMapEditor`                  | Én current boundary nu; immutable boundary-revisioner efter sikker migration.            |
| Kort               | Eksisterende Leaflet/Geoman-komponenter                                            | Del map shell, baselayers, adaptere og lifecycle; opret ikke endnu en kortmotor.         |
| Upload admission   | `uploads-service`, `upload-import-service`, `drone-image-metadata`, `UploadWizard` | Én valideringsindgang; originalfilen er immutable og checksum er autoritativ.            |
| Drone              | `drone_flights`, `drone_assets`, `drone-service`                                   | Originaler, ortofoto/COG og analyser er separate, relaterede assets.                     |
| Tidsdimension      | Nyt canonical dataset-/timeline-lag                                                | Alle events har projekt, tidsrum/tidspunkt, kilde, status og provenance.                 |
| Før/Efter          | `BeforeAfterCompare` som visningsfundament                                         | Survey rounds og par er domæneobjekter, ikke kun løse mediereferencer.                   |
| Observation/review | Eksisterende observationstabeller plus senere canonical envelope                   | Fagligt review ændrer status og tilføjer evidens; original observation overskrives ikke. |
| Handling           | `actions` og `action_evidence`                                                     | Genbrug `actions` som task-workflow og bind det til intervention/change event.           |
| Rapport            | `documents-service` og `report-engine`                                             | Én pipeline: låst snapshot → render → privat Storage → hash/version → approval.          |
| Audit/evidens      | `evidence-service` og én audit-service                                             | Actor, project, entity, before/after, checksum og metodeversion bevares.                 |

## Samlet dataflow

1. Brugeren vælger/opretter et projekt og definerer en valideret projektgrænse.
2. Datakilder og uploads går gennem preflight, checksum, projekt-/tenant-scope og validering.
3. Et sync-/importjob producerer et immutable dataset eller et valideret asset med provenance.
4. Dataset/asset bindes til en projektfase, survey round og tidslinjen.
5. Sammenligning producerer observationer og eventuelle change events med metode/usikkerhed.
6. Reviewer godkender, afviser eller sender tilbage uden at ændre originalinput.
7. En godkendt ændring kan skabe intervention og opgaver med ansvarlig, deadline og evidenskrav.
8. Rapporten låser de valgte inputversioner i et manifest og genererer et nyt immutable output.

## Upload-state machine

`selected → preflight → hashing → duplicate_check → uploading → awaiting_validation → validating → ready → importing → imported | imported_with_warnings | rejected | failed`

- SHA-256 beregnes for alle filer før canonical import; idempotens er mindst `project_id + content_sha256 + logical_role`.
- Parsefejl, ukendt UTC, modstridende GPS, manglende georeference eller uafklaret CRS må ikke føre til `ready`.
- Originalfiler er immutable. Afledte assets har egen checksum, metodeversion og parent-reference.
- Store filer kræver resumable transport, ægte progress, retry og resume. Den nuværende standard-upload med høj filgrænse er ikke en produktionsklar storfilstrategi.
- Tre private staging-buckets og det afgrænsede `storage.objects`-SQL-scope er verificeret; canonical drone-/document-paths, rigtig Storage API, upload-intent, retention og resumable endpoint er **AFVENTER**.

## Proveniensminimum

Hvert dataset, asset og rapportinput skal mindst have:

- canonical source-id og provider;
- endpoint, collection/layer/asset role;
- upstream-id/version eller `fetched_at`;
- projektområde og requestparametre;
- CRS, rumlig/tidslig opløsning og dækningsperiode;
- licens og vilkårsversion;
- checksum, job/request-id og parser-/metodeversion;
- actor/uploader og den rapportversion, der anvendte inputtet.

## Dubletter der konsolideres

1. Statiske connectorregistries, `data_sources`, `map_layers` og parallelle data-source services samles omkring ét typed registry og projektbindingsmodel.
2. Flere Arealdata/Miljøportal WFS-klienter samles i én adapter med fælles fixtures og fejlsemantik.
3. Element84 og Copernicus STAC samles bag én STAC-kontrakt med provider-konfiguration.
4. `reports`, `documents`, mock report UI og jsPDF-generator samles i én versionsfast pipeline.
5. De to audit-services samles; project-id er obligatorisk for projekthændelser.
6. Den skjulte Connect-datakildewizard og projektets wizard samles; falsk connection-success fjernes.
7. `uploads` forbliver staging; `project_media`, `drone_assets`, `observation_media` og evidens får tydelige canonical/specialiseringsrelationer frem for endnu en parallel filsti.

## Sikkerhedsgrænser

- Browseren bruger brugerens JWT og RLS. `service_role` er kun tilladt i autentificerede, autoriserede og snævert scoped serverflows.
- Alle relationer skal forhindre cross-project poisoning; project-ID på parent og child skal kunne håndhæves i databasen.
- Private filer leveres via autoriseret download/signed URL, ikke `getPublicUrl`.
- Previewdata må aldrig erstatte en live-fejl eller ligne kundedata.
- Ingen migration/deploy/live tests før miljø, backup/rollback og mandat er verificeret.

## Stopregler

Ingen syntetiske evidenskoordinater, ingen automatisk biologisk/juridisk konklusion, ingen påstået live-evidens uden observation, ingen ny parallel platform og ingen P1/P2-pynt før den bindende P0-rejse og gates er bestået.
