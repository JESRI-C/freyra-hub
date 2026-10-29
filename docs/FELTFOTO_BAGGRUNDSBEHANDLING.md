# Automatisk behandling og private visningsbilleder

Pakke C2 er bygget oven på C1, på `codex/field-photo-processing-v1`, [draft-PR 25](https://github.com/JESRI-C/freyra-hub/pull/25). App og worker deler originale foto-ID'er og checksums. Der er ingen ny parallel originaldatabase.

**Aktuel installation:** Appen og A/B/C1/C2-databasen er nu installeret i det isolerede stagingmiljø, se [kvittering](field-staging-delivery.json). Appens worker-version er `1e09bf40-c7ec-4ae4-a6cc-8cf34a2e90a6`, kilde `a3dc06bb2af30bd9dbb4357c390ab4e575f6aa28`. Den separate billedworker er endnu ikke udgivet eller aktiveret; automatikken er fortsat slukket. Brugerens egen telefonprøve erstatter ikke de øvrige åbne driftsprøver. Beskrivelsen nedenfor af ingen hosted ændring vedrører den oprindelige implementerings- og CI-kørsel.

## Forløb og bevaring

En modtaget original opretter automatisk en baggrundsopgave i samme databasetransaktion som C1's kontrolopgave. Eksisterende modtagne C1-filer får opgaver ved migrationsreplay. Jobbet verificerer om nødvendigt originalens bytes med C1's serverkontrol og går derefter videre til et separat visningsbillede. En allerede verificeret original går direkte til billedfasen.

En separat Cloudflare-worker tager højst fire serielle opgaver pr. tick. Staging-konfigurationen indeholder en tick hvert andet minut. Arbejdet hentes gennem en service-only RPC med `FOR UPDATE SKIP LOCKED`; samtidige workers tager forskellige jobs. En lease på 180 sekunder gør afbrudt arbejde genfindeligt. C1's selvstændige verifikationslease bevares og forhindrer samtidig manuel og automatisk hashkontrol.

Hver fase har højst fem automatiske forsøg. Midlertidige fejl giver eksponentiel ventetid, op til en time. Ugyldigt format, for stor kilde, hashkonflikt, ændret kilde og tilbagekaldt adgang får særskilt status. En problematisk fil stopper ikke andre jobs. Et systemnedbrud efter sidste forsøg ender ved næste tick som fejlet. Automatikken bruger uploaderens aktuelle projektrettighed, som også kontrolleres før commit; den får ikke rettigheder gennem gamle JWT-oplysninger. Ved en tilbagekaldt uploader bliver jobbet blokeret og kræver en konkret driftsafklaring. Andre sagsaktiviteter kan fortsætte.

## Afledningen

- Originaler på op til C1's 50 MiB bevares uændret. Automatisk visning er her begrænset til 20.000.000 inputbytes, i overensstemmelse med bindingens 20 MB-grænse. Større originaler kan stadig byteverificeres; de får en eksplicit status uden visningsbillede.
- Denne opskrift accepterer MIME-deklarationerne JPEG, PNG, WebP, HEIC/HEIF og GIF. Faktisk afkodning sker i Images-bindingen. Afviste formater/dekoderfejl bliver ikke til et opdigtet billede. Hosted HEIC og telefonvarianter skal stadig prøves i staging.
- `preview-jpeg1536-v1`: højst 1536 × 1536 pixels, `scale-down`, kvalitet 80, stillbillede. Opskriften bruger en eksisterende JPEG-kontrol, der nu deles med dronevisningen. APP/COM-felter, herunder EXIF/GPS, XMP og kamerafelter, fjernes fra afledningen. Originalens metadata røres ikke.
- Input genhentes privat og hashes igen, før det sendes til afkoderen. Forkert størrelse eller hash giver ingen afledning. Redirects og andre origins/stier afvises. Den samlede billedforberedelse har en deadline; outputlæseren er begrænset til 2 MiB.
- Afledningen gemmes uden upsert i den private bucket `field-photo-previews`, under projekt, original-ID, opskrift og egen checksum. Et mistet kvitteringssvar kan genforsøges uden overskrivning.
- Før kvittering indhentes den konkrete Storage-version af visningsbilledet. Worker genhenter den gemte fil og beregner dens hash. Commit genkontrollerer både originalbinding, aktuel adgang og afledningens objekt-id/version/tid. Kvitteringen er uforanderlig og indeholder kildehash, afledningshash, opskrift, størrelse, dimensioner og objektbinding.

## Visning og adgang

Fotohistorikken viser et komprimeret visningsbillede, når det foreligger, samt forståelig status ved ventende, blokeret, fejlet eller ikke-understøttet behandling. Der hentes ikke automatisk en stor original som fallback. Selve kontrolkvitteringen og professionel vurdering er fortsat separate.

Visningslinks dannes gennem brugerens Storage/RLS-adgang og er gyldige i 60 sekunder. Der gemmes ingen signerede URL'er i databasen. Metadata og objekter kræver projektets læseadgang. Browseren har ingen skrive-/sletterettighed i preview-bucket. En privilegeret filudskiftning matcher ikke den registrerede objektversion og kan derfor ikke signeres som den gamle afledning. Allerede udstedte links er korte TTL-links, ikke en garanti for øjeblikkelig tilbagekaldelse af igangværende downloads.

## Drift og aktivering

Worker har egen konfiguration, entrypoint, genererede bindings-/runtimetyper og separat typecheck, så browserens DOM-typer ikke blandes med workerens typer. Den har ingen offentlig behandlingsrute. Der er kun en staging-kontrakt og lokal testkonfiguration; en runtimekontrol afviser andre hosted Supabase-adresser.

`FIELD_PHOTO_PROCESSING_ENABLED=false` er det indcheckede udgangspunkt. Der er ikke udført hosted migration, deployment, aktivering eller betalte billedkald i dette arbejde. CI bruger ren esbuild-bundling og indeholder ingen deploymentkommando. Der er desuden udført en lokal Wrangler dry-run uden publicering. Logning er begrænset til tick og antal; råfotos, brugeroplysninger, URL'er og credentials logges ikke.

Afhængighedsordnet staging-aktivering:

1. Gennemgå C1/C2's grønne CI på den konkrete revision og bevar database-/originalbackup. A/B/C1-migrationer skal være med før C2. Anvend kun i det isolerede stagingprojekt.
2. Installer C2-migrationen, læs RLS/grants/workerprivilegier tilbage, og kontroller at eksisterende C1-opgaver er kølagt uden nye originaler.
3. Byg appen og denne worker til staging med flaget fortsat slukket. Opsæt alene staging-servicehemmeligheden gennem godkendt secret-flow. Kilden indeholder ingen nøgle.
4. Kontroller faktisk originalupload, privat Storage-adgang, Images-tilgængelighed og navngivet driftsansvarlig. Aktiver først den konkrete staging-worker efter denne kontrol.
5. Afprøv fotos fra iPhone/Android, herunder HEIC, netafbrydelse, tabt svar, udløbet lease, genstart, læser og tilbagekaldt adgang. Visningsbillede skal stemme visuelt med originalen uden opforstørrelse/forvrængning, og råfilens hash skal være uændret.
6. Afprøv belastning, alarmer, genoprettelse af både database og faktiske filer. Først derefter kan C kaldes driftsklar. Produktionsrelease kræver særskilt beslutning.

Stop: sluk workerens aktiveringsflag. Deaktivering ændrer ikke råfiler eller kvitteringer; igangværende leases udløber. En navngivet operatør skal gennemgå terminale fejl og blokerede uploads før et eventuelt nyt forsøg. Automatisk nulstilling af tællere og brugergrænseflade til genstart af terminale preview-jobs indgår ikke her.

## Oprydningspolitik

Der slettes intet automatisk. Ufærdige intents, originaler og kvitteringer bevares. En upload af visningsfilen, som lykkes før en afbrudt databasekvittering, kan efterlade en orphan-afledning; det samme hashbaserede objekt kan genbruges ved genforsøg efter bytekontrol.

Et senere oprydningsjob skal først lave en read-only fortegnelse, udelukke alle aktive leases samt refererede originaler/afledninger, overholde en besluttet bevaringsperiode og have prøvet filgendannelse. Der er ingen afklaret generel slettefrist i brugerens krav, så en sådan frist indføres ikke stiltiende.

## Test og evidensgrænser

Målrettede prøver dækker kildeændring, størrelse/format, metadatafjernelse, deadline, genfundet objekt, efterfølgende genhash af det gemte preview, køens portionsstørrelse, fejlisolation, kvitteringer og read-only visning. SQL-prøver dækker kølægning, lease, genforsøg, backoff, stopgrænse, rettigheder, filbindinger og uforanderlige kvitteringer.

En separat offline-smoke-test bruger et genereret PNG og den faktiske lokale Images-binding, uden eksterne API'er eller kundemateriale. Den producerer et faktisk JPEG, hvis dimensioner og hash kontrolleres. Den lokale binding har lavere fidelity og understøtter ikke alle transformeringsparametre; denne prøve bekræfter afkodning/filflow, **ikke** hosted `scale-down`-adfærd eller HEIC-kompatibilitet. Der kræves stadig hosted billed-/telefonaccept.

Begge CI-jobs bestod på `5b031d748238c8c5bb4e9790863ef3813accef0d`, [run 40884821323](https://github.com/JESRI-C/freyra-hub/actions/runs/40884821323):

- 3.056 tests i 223 applikations-/worker-testfiler, app-/worker-typechecks, lint (0 fejl, 24 eksisterende advarsler), beregningskilder, ren worker-bundling, den faktiske lokale Images-prøve og appbuild.
- Frisk migrationsreplay, 1.031 assertions i 17 databasefiler, inklusive 50 nye C2-assertions; de to nye scenarier med samtidige claims og udløbet lease samt alle eksisterende samtidighedsprøver; dump/restore og databasefunktionskontrol.

To reelle PostgreSQL-transaktioner fik hver sit job, mens begge transaktioner stadig var åbne. En udløbet lease blev overtaget med et nyt token, og den gamle worker kunne ikke frigive den nye lease. Den lokale billedprøve bekræftede et 134-bytes syntetisk PNG til et 27.761-bytes JPEG; den lokale bindings lavere fidelity er fortsat en grænse som beskrevet ovenfor. Lokal stagingbuild og Wrangler dry-run bestod også. Efterfølgende evidenscommit ændrer alene dokumentation og Git-reviewmarkering af genererede typer.

Database-dump/restore er teknisk databasebevis; faktisk original- og preview-filgendannelse er endnu ikke afprøvet. Ingen e-mails, AI-artsbestemmelse eller produktionsrelease er udført.

## Primærkilder

- [Images-binding: metoder, inputgrænse og lokal fidelity](https://developers.cloudflare.com/images/optimization/binding/).
- [Cloudflare: understøttede formater og grænser](https://developers.cloudflare.com/images/get-started/limits/).
- [Workers: Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
- Projektets fastlåste Wrangler-/Miniflare-typer og den genererede worker-kontrakt. Ingen ny projektafhængighed er tilføjet.
