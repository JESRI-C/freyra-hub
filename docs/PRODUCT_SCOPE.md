# GoFreyra produktscope

Senest opdateret: 2026-08-27. Dette dokument beskriver leverancescope; implementeringsstatus findes i `EXECUTION_STATE.md` og `P0_BACKLOG.md`.

## Bindende P0

Målestokken er **Haderslev Vandløb Før/Efter** i det eksisterende `freyra-hub`. Repositoryet indeholder primært Skallebæk/Haderslev-demoer; endeligt kundenavn, lokalitet og eventuelle vandløbsnavne er derfor **AFVENTER** verificeret projektmaster. Der må ikke oprettes et dubletprojekt for at løse navneuklarheden.

P0 er først leveret, når en reel bruger i et rent testmiljø kan:

1. blive inviteret/oprettet, logge ind, nulstille kodeord og logge ud;
2. se og ændre kun egen organisations data, også via API, URL og Storage;
3. oprette eller åbne kundesagen og importere, tegne, redigere, versionere og genindlæse projektgrænsen;
4. oprette Før- og Efter-runder og uploade relevante dronefotos, ortofoto/geodata og obligatorisk metadata uden skjult datatab;
5. arbejde i Leaflet-kortet med projektlag, relevante officielle lag og dokumenteret kilde/proveniens;
6. sammenligne versionsfaste Før/Efter-data og parrede fotopunkter;
7. gemme fagligt forsvarlige målinger og observationer med enhed, metode, inputversion, usikkerhed og menneskelig validering;
8. generere, godkende og hente en reproducerbar, versionsfast PDF og et datamanifest;
9. bestå releasegates for tenancy/RLS, unit/integration/browser, typecheck, lint og build.

Eksisterende funktionalitet skal genbruges, når den består testen. Seed-, preview- og mockdata må bruges til lokal udvikling, men er ikke P0-evidens.

## P1

P1 optages kun efter bekræftet behov hos mindst tre kvalificerede kunder. Kandidater er automatisk fotogrammetri, tung geobehandling i worker/container, avanceret automatisk ændringsanalyse, bredere kildekatalog, mere satellitanalyse og yderligere rapporttyper.

## P2

Uprøvede hypoteser, brede moduludvidelser og generelle markedsfunktioner er P2. De må ikke fortrænge et manglende P0-acceptkriterium.

## Eksplicitte fravalg

- Ingen ny platform, parallel kopi eller stack-omskrivning.
- Ingen HubSpot-integration i GoFreyra.
- Ingen blockchain, tokenisering eller rå/personhenførbare data on-chain i P0.
- Ingen påstand om bundkote, dybde, hydraulisk kapacitet eller præcise tværprofiler ud fra almindelige RGB-fotos alene.
- Ingen stor drone-, GeoTIFF-, video- eller punktskyfil i Git; de hører til i objektstorage.
- Ingen produktiondeploy, merge til `main`, destruktiv produktionsmigration eller ekstern afsendelse uden særskilt godkendelse.
- Ingen hardcodet offentlig kilde som erstatning for verificeret endpoint, lag-id, licens og CRS.

Første kommercielle pejlemærke er website-salg senest 2026-09-30; datoen ændrer ikke sikkerheds- eller kvalitetsgaten.
