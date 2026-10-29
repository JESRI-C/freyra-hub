# Genoptagelig feltfotoupload og serverkvitteringer

Leverancen er første del af pakke C, bygget oven på fotooriginal og placeringshistorik fra pakke B. Udviklingsgren `codex/field-photo-uploads-v1`, [draft-PR 24](https://github.com/JESRI-C/freyra-hub/pull/24), base `codex/field-photo-positions-v1`. Ingen hosted migration eller deployment er udført.

## Brugerforløb

1. Vælg et foto og udfyld oplysninger. Klienten bevarer den samme uploadidentitet ved et uændret genforsøg i den åbne formular. Skifter fil eller oplysninger, dannes en ny uploadidentitet; en allerede modtaget registrering overskrives aldrig.
2. Databasen reserverer en projekt- og brugerbundet sti: `projectId/field-uploads/uploadId/original`. Payload og optagegrundlag fryses. Nye uploads er højst 50 MiB; råfilen komprimeres ikke.
3. Klienten forsøger først at afslutte et eventuelt allerede eksisterende objekt. Kun en egentlig manglende-fil-fejl starter TUS. Det gør et mistet svar efter en gennemført overførsel sikkert at genforsøge.
4. TUS overfører originalen i 6 MiB-chunks med fremdrift og uden upsert. Fingerprint omfatter Storage-miljø, bucket, sti og filidentitet. Credentials genlæses før hver request; brugerskift standser overførslen. Pause beholder den igangværende TUS-session.
5. Atomisk finalisering kontrollerer den faktiske Storage-ejer, størrelse og MIME-deklaration. Den opretter én medierække, eventuel første placeringsrettelse og én holdbar kontrolopgave. Filmodtagelsen bindes til objekt-id, version og opdateringstid.
6. Serveren henter via en kortlivet, adgangskontrolleret URL, validerer Storage-origin og den præcise sti, afviser redirects og streamer filen gennem SHA-256 med begrænset hukommelse. Både for korte og for lange downloads afvises. HTTP Content-Length er ikke bevis for en fuldstændig fil.
7. Før kvittering låser databasen aktørens aktuelle medlemskaber og kontrollerer filbindingen igen. En ændret fil eller tilbagekaldt adgang giver ingen succes. En uforanderlig kvittering fastholder den serverberegnede hash og status `verified` eller `hash_mismatch`.
8. Formularen afslutter først med en succesmeddelelse, når en passende kvittering foreligger, og mediet er genlæst. Ved fejl bliver den valgte fil bevaret i den åbne formular. Et modtaget foto kan også få genoptaget kontrollen fra feltfotoets historikpanel.

## Holdbare kontrolopgaver

En kontrolopgave oprettes i samme transaktion som modtagelsen. En serveranmodning tager en 90-sekunders lease; et samtidigt kald får besked om, at kontrollen kører. Privat download har en 45-sekunders timeout. Fejl frigiver kun den pågældende lease; ved procesnedbrud kan en anden anmodning overtage efter udløb. Forsøg tælles, fejl gemmes som faste koder, og et modtaget foto genoverføres ikke for at genstarte kontrollen.

Behandlingen startes her af den aktuelle upload eller brugerens kontrolknap. Der er **ikke** aktiveret en planlagt worker, automatisk sweep eller Cloudflare Queue. Jobtabellen gør arbejde genfindeligt; den alene garanterer ikke behandling uden en ny anmodning. Automatisk baggrundsdrift og afledte previews er næste del af C. Holdbar lokal lagring på telefonen, opgavepakker og pladsstyring hører til D. Den åbne formular og en TUS-reference er ikke en offlinekø; lukning af browseren kan stadig kræve, at originalen vælges igen.

## Adgang og dokumentationsgrænse

- Læser: læser projektets kvitteringer, men kan ikke starte upload eller kontrol.
- Feltmedarbejder: opretter og afslutter sin egen reserverede upload og starter kontrol for modtagne originaler i projektet. Den snævre uploadrettighed giver ikke fri ændring af eksisterende projektmedier eller Storage-filer.
- Editor: samme kontroladgang og eksisterende redaktionelle rettigheder. En anden editor kan ikke overtage en uploadidentitet eller udfylde dens reserverede sti.
- Browseren kan hverken skrive kvitteringer, jobs eller serverens kontrolstatus direkte. Privilegerede processerings-RPC'er er kun tilgængelige for service_role; serveren bruger sin middleware-verificerede bruger som aktør. De få definer-funktioner ligger i private schema, med eksplicit scopekontrol og fast search_path.
- Fra reservationen er den nye originalsti beskyttet mod opdatering, omdøbning og sletning via almindelig Storage-adgang. En privileged administrator/service role er fortsat en betroet driftsgrænse; versionen kontrolleres igen før en kvittering.
- Kvitteringen bekræfter, at serverens fulde filhash matcher den indsendte hash. Den bekræfter ikke kameratid, GPS-sandhed, billedets pixelindhold, artsbestemmelse, sikker filtype, rettigheder eller faglig kvalitet. MIME kommer fra uploadens deklaration og Storage-metadata; ingen pixeldekoder eller virusscanner er indført.
- Nye originaler med uploadidentitet kan først markeres `is_report_ready=true`, når deres bytekvittering er `verified`. Kontrollen udfører ikke en faglig rapportgodkendelse. Ældre feltfotos får ikke efterkonstrueret serverkvittering.
- Beskeder indeholder ikke private links eller tokens. Signerede links persisteres ikke. Den oprindelige uploaderdeklaration fra B ændres ikke; serverkvitteringen er en særskilt kilde.

## Test og accept

Applikationsprøver omfatter streamafbrydelse, størrelse, URL-afgrænsning, genforsøg uden reupload, checksumkonflikt, fornyede credentials, brugerskift, kvitteringsvisning og læseradgang. SQL-prøver omfatter RLS, reserveret sti, feltrolle, atomisk modtagelse, låst original, lease, genforsøg, ændret objektversion, tilbagekaldt medlemskab, uforanderlig kvittering og rapportklar-gate.

Der er desuden en CI-prøve med reelle samtidige PostgreSQL-forbindelser: samtidig intent, samtidig finalisering, én behandlingslease og medlemskab trukket tilbage under kvittering. Prøven kræver numerisk loopback og eksplicit disponibel lokal database; den kan ikke rettes mod hosted PostgreSQL.

CI-resultater og konkret revision føres i udviklingsplanen efter afsluttet kørsel. Stagingprøver skal stadig dokumentere den faktiske Storage/TUS-API, fysisk iPhone/Android, tabt forbindelse før/efter sidste chunk, genstart, sessionudløb, filbevarelse og adgang efter kvittering. Hverken pgTAP, mocked Storage eller et stagingbuild udgør dette bevis. Der er ikke foretaget e-mailudsendelse, AI-kald eller produktionsrelease.

## Næste leverance i C

1. Begrænset automatisk behandling af de holdbare jobs med driftsansvar og genforsøgsgrænser.
2. Afledte miniature-/visningsfiler med egen checksum, dimensioner, format og binding til den verificerede original; separat fejlsituation ved ikke-understøttet format. Ingen erstatning af råfilen.
3. Oprydningspolitik for ufærdige intents/orphan-objekter, som respekterer bevaring og kendte genforsøg. Denne leverance sletter dem ikke automatisk.
4. Isoleret hosted accept med Storage, telefoner og genoprettelse før C kan kaldes driftsklar.

## Kilder kontrolleret under implementeringen

- [Supabase: Resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads): direkte Storage-host, 6 MiB-chunks, genoptagelse, udløb af TUS-URL og konflikt ved samme sti. Backendens TUS-URL kan udløbe efter 24 timer; den holdbare intent er uafhængig af URL'en.
- [Cloudflare: node:crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/): streaming med createHash i projektets eksisterende nodejs_compat-runtime.
- `tus-js-client` 4.3.1 i lockfil og lokale typer: onBeforeRequest/HttpRequest.setHeader. Ingen ny afhængighed er tilføjet.
