# Feltregistrering og dokumentation i Freyra

Produktanalyse og anbefalet byggegrundlag. Ingen implementering eller udgivelse er udført i denne analyse. Kodefundene gælder det lokale checkout ved `62fa6c7`; de dokumenterer ikke aktuel produktionsadfærd eller en ny belastningsprøve.

Freyra bør have ét fælles lag til jobkort, feltbesøg, originalfotos, observationer, faglig vurdering og rapportgrundlag. Natur, vandløb, byggeri og senere græsningspleje bruger samme kerne med forskellige formularskabeloner. På telefonen vises den aktuelle opgave og de nødvendige registreringer. På computeren samles materialet til kort, sammenligning, gennemgang og rapporter.

Det passer til både brugerens nye krav og tidligere Freyra-materiale om en verificerbar evidenskæde. Modulet kan være inkluderet i nogle produktpakker og sælges som tilvalg i andre. En særskilt feltindgang skal bruge samme identiteter, projektadgang og originaler som dashboardet.

## Fastlagte krav og første anvendelse

| Emne | Brugerens retning | Konsekvens for produktet |
| --- | --- | --- |
| Første komplette forløb | Bykær Bæk, før og efter grødeskæring | Knyt plan, faktisk udførelse, fotos, observationer, vurdering og rapport sammen |
| Langsigtet anvendelse | Åmænd, feltmedarbejdere, naturplejere, kommune, øvrige projektparter; også naturpleje med dyr | Fælles kerne med faglige udvidelser og projektspecifik adgang |
| Skyhost | På sigt erstatte den relevante opgave- og dokumentationsdel | Indfør først en kontrolleret import; hold integrationen åben |
| Jobkort | Nødvendige basisfelter, ændringsmuligheder og egne felter | Versionerede skabeloner med stabile felt-ID'er og typede værdier |
| Enheder | Primært iPhone, Android og computer | Telefonvenligt feltflow og desktoparbejdsrum; tablet følger responsivt |
| Offline | Tag fotos og arbejd videre; overfør og lav billedafledninger ved net | Vedvarende lokal filkø, synkroniseringsstatus og serverbaseret efterbehandling |
| Volumen | Op mod 1.000 billeder om dagen på tværs af mange opgaver; cirka 200 på en mindre opgave | Dimensionér efter bytes, samtidige opgaver og voksende historik |
| Position | 50 meters rettelse som standard, justerbart i opsætning | Bevar originalpunkt, korrektion, afstand, årsag, aktør og anvendt regelversion |
| Gentagelser | Hjælp til at genfotografere samme sted er ønsket | Faste observations-/fotopunkter med tidligere billede og retning |
| Arter og AI | Alle planter som langsigtet ambition; artsforslag, før/efter, dokumentationsmangler, rapportudkast og handleforslag | Udvidelig analysemodel, med dokumenteret anvendelsesområde for hver analyse |
| Godkendelse | Medarbejder gennemgår; tvivl kan sendes videre uden at standse arbejdet | Uafhængige opgave-, upload- og vurderingsstatusser |
| Dokumentationsniveau | Høj sporbarhed og audit trail | Konkret kravprofil, versionsbundet evidens og efterprøvelige afleveringer |
| Miljødata | Eksisterende offentlige kilder, vandstandsloggere og senere egne sensorer, fx ilt | Adapterkontrakt og fælles tidsserie-/sensorgrundlag |
| Modtager | Kan udforske og arbejde med materialet samt få AI-hjælp til rapporter | Adgangsstyret arbejdsrum og frosne afleveringsversioner |
| Produktpakker | Både fast del og tilkøb | Serverhåndhævede modulrettigheder adskilt fra personens projektrolle |

Brugerens ord om, at billeder først bliver "resized", når der er net, fortolkes som en bevaret original og efterfølgende visningskopier. Originalen skal ikke erstattes af en nedskaleret fil. Denne fortolkning bruges som anbefalet standard i byggegrundlaget. Det er ikke et valg om at sende alle originaler over mobilnet: store overførsler bør kunne afvente Wi-Fi, med mulighed for at vælge mobilnet. Piloten skal måle dataforbrug og overførselstid.

## Eksisterende materiale og historik

Syv relevante tråde samt ældre sider i to Codex-tråde er gennemgået. Der er ikke fundet en konkret Skyhost/Skyhus/DALCA-Excel-fil i det afgrænsede materiale. Navnesøgninger i tilgængelig Drive-adgang og lokale filnavne fandt heller ikke en sådan eksport. Det udelukker ikke, at den ligger under et andet navn, i en anden mappe eller i en ældre tråd.

Der er derimod fundet:

- Tråden **Undersøgelsesplan for naturprojekter**: kommunen bruger Driftweb til opgaver og grødeskæringsdokumentation. Telefon, drone og eksisterende kommunale billeder/dokumenter er tidligere valgt som afsæt. Sensorer og DMI er tænkt ind som senere tilkoblinger.
- Tråden **Fortsæt arbejdet fra delt chat**: kommunalt segment først og privatsegmentet i sammenhæng hermed, inklusive byggeri og naturbaselines. En ældre rapport med 1.000 bestilte træer blev udtrykkeligt afvist som gældende; det antal er ikke videreført her.
- Et ældre Drive-oplæg, **02 PROJEKTCASE - Verificerbar evidenskæde for natur- og arealprojekter**, med projektidentiteter, feltdata, sensoradaptere, versionshistorik, faglig godkendelse og reproducerbare rapporter. Det er et konceptgrundlag fra august, ikke en status på den nuværende kode.
- Den tilhørende **03 WORKBOOK - Freyra Innobooster 2026 - Baseline, MVP, marked, piloter og budget** indeholder også felt-, foto- og sensorretningen. Det er en planlægningsarbejdsbog og ikke den søgte Skyhost-eksport.
- Den eksisterende udviklingsplan og `PAKKESTATUS.md` placerer allerede artsforslag, offentlige kilder, lokale sensorer, byggeri/natur og eksterne integrationer i det samlede produktspor.

Links til de to Drive-kilder findes under Kilder. De ældre dokumenters budgetter og statusmål er ikke overtaget som aktuelle forudsætninger.

## Genbrug og konkrete mangler i Freyra

| Del | Verificeret kodefund | Følge for den nye løsning |
| --- | --- | --- |
| Projekter og adgang | Organisationer, projekter, medlemskaber og projektroller findes | Genbrug identiteter og adgangsmodel; opret ikke et parallelt kunderegister |
| Byggeri og natur | `construction_projects` og `nature_contexts` er knyttet til eksisterende `projects` | Feltfund og dokumentation kan høre til samme projekt på tværs af fagområder |
| Opgaver | `actions`, `action_evidence` og udførelsesversioner findes | Udbyg det eksisterende opgaveobjekt til jobkort |
| Bilagsgrænse | Udførelseskontrakten har maksimalt 20 `evidenceIds`, også i SQL-validering | 200 fotos skal forbindes via registreringer, samlinger og relationer; ikke et voksende ID-array |
| Formularer | Workspacefelter er i høj grad fastlagt i kode | En egentlig skabelonmotor med versionsbinding skal udvikles |
| Genoptagelig upload | Monitoring har TUS, upload-intent, finalisering og genlæsning | Genbrug transport og modtagelsesprincipper til feltfotos |
| Dronebatch | Batch på op til 200 fotos og begrænset samtidighed findes | Nyttigt genbrug, men browserkøen er ikke varig offlineopbevaring |
| Feltoriginaler | Feltflowet har svagere kilde-/positionsbinding end droneoriginaler | Saml et fælles originalbegreb, med separate capture- og rettelsesdata |
| Medievisning | Projektmedier hentes gennem alle sider og signeres samlet; fotokortet har et opslag begrænset til 500 | Indfør brugerrettet pagination, kortaggregation og hentning efter behov |
| Baggrundsarbejde | Kontrolkøer ligger blandt andet i browserhukommelse; dronejobs er en fotogrammetrikontrakt | En vedvarende serverkø mangler til almindelig medieefterbehandling |
| Artsflow | Generel billed-AI og navneopslag findes; et accepteret forslag kan få `confirmed` og antal 1 | Adskil AI-forslag, brugeraccept, faglig vurdering og faktisk optælling |
| Sensorer | Sensoroversigt og observationsbyggesten findes | En oversigt beviser ikke indsamling, kalibrering eller en tilkoblet logger |
| Offentlige stationer | Stationsadapteren markerer måleserier som ikke hentet | Stationsinventar må ikke vises som faktisk lokal vandstand |
| Rapport | Versioner, kildehenvisninger, review og eksport findes | Udvid det eksisterende rapportspor med den nye feltkæde |
| Moduler | Indstillingssider viser moduler og abonnement | Et egentligt serverhåndhævet rettigheds- og forbrugssystem er ikke påvist |
| Dyr og græsningspleje | Intet operationelt flok-/dyretilsynsflow påvist i den gennemgåede kode | Fælles besøg og dokumentation kan genbruges; de faglige objekter er en udvidelse |

Konsolidering kræver en eksplicit mapping mellem `uploads`, `project_media`, kilde-/evidensobjekter og deres forskellige lagrings- og adgangsregler. Eksisterende kilde-ID'er, referencer og rapportbindinger skal bevares. Den fælles kontrakt indføres gennem adaptere og kontrollerede ændringer.

## Produktstruktur og jobkort

Den fælles kerne bør indeholde projekt, sted/område, opgave, besøg, registrering, originalmateriale, rettelse, vurdering og rapportreference.

| Faglig indgang | Eksempler på skabeloner | Fælles dokumentation |
| --- | --- | --- |
| Vandløb og natur | Førbesøg, grødeskæring, efterbesøg, bræmmetilsyn, invasive planter | Sted, metode, faktisk udførelse, fotos, observationer og opfølgning |
| Byggeri og natur | Baseline, byggepladstilsyn, afvigelse, afværgeforanstaltning | Samme kerne koblet til projektets risici, krav og indsats |
| Græsningspleje og dyr | Besøg på fold, dyre-/flokobservation, hegn, vand og udført pleje | Samme kerne med reference til fold, flok eller individ, når relevant |
| Lavbund og måleprogram | Loggerbesøg, kontrolpunkt, feltobservation og prøve | Samme kerne med målepunkt, instrument, metode og tidsserie |

Første jobkort bør omfatte titel/type, projekt, område/punkt/strækning, ansvarlig, status, prioritet, planlagt besøg, instruktion/tjekliste, faktisk udførelse, fotos/observationer, afvigelser og næste opfølgning. Timer, materialer og maskiner kan være valgfrie feltgrupper.

Tilpasning omfatter overskrifter, hjælpetekster, rækkefølge og ekstra felter såsom tekst, tal, enhed, valg, dato, ja/nej, gentagen registrering og foto. Systemfelter som identitet, kilde og historik bevares. Hvert felt har et stabilt ID; ændret overskrift ændrer ikke gamle registreringers betydning.

En offentliggjort skabelon ændres som en ny version. Besøget fastholder sin skabelonversion. Et offlinebesøg kan derfor indsendes med sin oprindelige struktur, selv om kontoret har lavet en ny skabelon. Typede ekstra felter kan lagres i et kontrolleret JSON-felt, mens søgbare kernefelter og relationer ligger struktureret. Der skal ikke oprettes nye databasekolonner for hvert kundedefineret felt eller tillades vilkårlig kode i felternes visningsregler.

## Datamodellens afgrænsning

Nedenstående er logiske objekter. Nye fysiske tabeller vælges først efter mapping mod den eksisterende model; navngivningen er ikke en migrationsspecifikation.

| Logisk objekt | Eksisterende ejer eller udvidelse | Forbindelse og versionsregel |
| --- | --- | --- |
| Organisation og projekt | Eksisterende organisationer, `projects` og medlemskaber | Alle objektopslag og filrettigheder kontrolleres inden for dette scope |
| Opgave/jobkort | `actions` | Tilknyt skabelonversion, geografi og besøg; genbrug stabilt opgave-ID |
| Undersøgelsesrunde | Eksisterende runder og `survey_round_versions` | Før-/efterrunde fastholder metode og formål; flere konkrete besøg kan høre til en runde |
| Feltbesøg | Genbrug relevant eksisterende objekt, ellers en afgrænset udvidelse | Tid, deltager, opgave og valgte skabeloner; ikke et nyt projekt |
| Registrering | Genbrug faglige observationer; udvid til øvrige feltregistreringer | Typet payload, skabelonversion, kilde og rettelsesreference |
| Medieoriginal | Adapter over eksisterende upload-/medie-/evidensobjekter | Ét stabilt aktiv-ID pr. original; observationer og opgaver refererer til aktivet |
| Udførelse og rettelse | Eksisterende udførelsesversioner og workspacehistorik | Ny version henviser til den tidligere; oprindelige kilder og vurderinger bevares |
| Analyse og vurdering | Eksisterende analyse-/reviewejere med nødvendige udvidelser | Binder til præcise inputversioner og angiver vurderingens omfang |
| Rapport og aflevering | Eksisterende rapportdokumenter og revisioner | Fastholder kilder, analyser, åbne punkter og afleveringsmanifest |
| Synkronisering og behandling | Nye driftskontrakter, hvor der ikke findes en egnet ejer | Lokal request-ID, serverkvittering, outbox og behandling knyttes til samme aktiv |

Et billede kan dokumentere flere observationer, og en observation kan bruge flere billeder. Disse forbindelser skal være eksplicitte. Samme fil på tværs af to kunders projekter må ikke udløse fælles læseadgang eller afsløre, at den anden kunde har filen. Indekser og visninger skal understøtte projekt, opgave/besøg, tidspunkt, status og sted. En ændret registrering gør afhængige vurderinger synligt forældede uden at omskrive en allerede afleveret rapport.

## Mobil, offline og synkronisering

Målarkitekturen bør have en fokuseret mobilklient med varig lokal filopbevaring og en lokal registrerings-/synkroniseringsdatabase. Den deler TypeScript-kontrakter, feltkomponenter og server-API med dashboardet. Capacitor med native lagring og en lokal database er en konkret kandidat; den præcise transport og lagerbinding skal afprøves på fysiske enheder, før platformvalget låses.

En installerbar webapp er egnet til en afgrænset afprøvning og webadgang. Browserlagring og Background Sync har begrænsninger, som gør det utilstrækkeligt at love sikker overførsel af flere GB, mens en iPhone er låst eller browseren lukket. Native indpakning alene løser heller ikke baggrundsoverførsel. Den kræver en dokumenteret platformsadapter og håndtering af operativsystemets vilkår. [Browserlagring](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API), [Capacitor-filsystem](https://capacitorjs.com/docs/apis/filesystem), [Apples baggrundsoverførsler](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background?changes=_8).

Før feltbesøg downloades den valgte opgave, skabelon, nødvendige data og eventuelt et afgrænset kortområde, når kortkildens vilkår tillader offlinebrug. Hele organisationens billedarkiv skal ikke ligge på telefonen.

Ved registrering gemmes foto og registrering med lokale entydige ID'er. Først efter vellykket lokal skrivning vises "Gemt på telefonen". Appen viser antal og bytes, manglende plads, pause og fejl. Billednedskalering til servervisning udskydes til net og efterbehandling; en lille lokal visning kan dannes uden at ændre originalen.

Køen skal overleve almindelig app-/telefongenstart og afbrudt net. Den gemmer ikke kun et midlertidigt filobjekt eller uploadlink. Enheder, der er offline, kan ikke loves øjeblikkelig spærring efter ændret projektadgang. Ved ny synkronisering kontrollerer serveren aktuel adgang; afviste registreringer bevares lokalt med synlig status og en kontrolleret vej til afklaring.

Anbefalede uafhængige statusser:

| Dimension | Eksempler |
| --- | --- |
| Lokal/transport | Gemt lokalt, venter på net, overfører, pauset, overført, servermodtaget |
| Originalkontrol | Afventer kontrol, kontrolleret, filproblem |
| Faglig vurdering | Ikke vurderet, accepteret af ansvarlig medarbejder, sendt til ekstra vurdering, afklaret med navngiven vurdering, omstridt |
| Opgave | Planlagt, i gang, udført, opfølgning |
| Rapport | Kladde, afleveringsversion; vurderingsstatus følger de enkelte udsagn |

En lokal fil kan først frigives til oprydning, når serveren har kvitteret for en kontrolleret original med matchende filidentitet/hash. En uploadprocent er ikke den kvittering. Uploaderen skal kunne genlæse kvitteringen, hvis svaret gik tabt.

To medarbejderes nye fotos samles. Konkurrerende rettelser til samme udførelse eller vurdering bliver separate versioner med en synlig konflikt, der skal afklares; seneste afsender må ikke lydløst vinde.

## Billedlager, behandling og kapacitet

Følgende er beregningsscenarier i decimale MB/GB/TB, ikke målte filstørrelser eller dokumenteret kapacitet:

| Antaget gennemsnit pr. original | 200 fotos på en opgave | 1.000 fotos på en dag | 250 aktive dage | 365 aktive dage |
| --- | --- | --- | --- | --- |
| 5 MB | 1 GB | 5 GB | 1,25 TB | 1,825 TB |
| 10 MB | 2 GB | 10 GB | 2,5 TB | 3,65 TB |
| 25 MB | 5 GB | 25 GB | 6,25 TB | 9,125 TB |

Visningskopier, sikkerhedskopier, video, raster og øvrige filer kommer oveni. De 1.000 daglige fotos er et samlet scenarie på tværs af opgaver og medarbejdere, ikke et krav om 1.000 fotos på hver telefon. Lager, båndbredde, transformationer og AI skal måles pr. organisation og projekt, før en prismodel fastsættes.

Den anbefalede kæde er:

`varig lokal original → autoriseret upload-intent → direkte genoptagelig filoverførsel → serverkvittering → varigt efterbehandlingsjob → kontrolleret original og visningskopier → faglig gennemgang`

Supabase tilbyder TUS-overførsel og anbefaler det ved store filer eller ustabilt net. Igangværende upload-URL'er har en begrænset levetid på op til 24 timer. Ved længere afbrydelser skal klienten kunne etablere en ny session ud fra den varigt gemte fil og dens identitet. Det eksisterende Freyra-flow er et genbrugsgrundlag; idempotens og genetablering af udløbne intents skal konkret afprøves. [Aktuel TUS-dokumentation](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

Originaler ligger privat. Filer sendes direkte til objektlager; appserveren modtager små kommandoer og metadata. En vellykket filoverførsel og en databasetransaktion er forskellige operationer. Finalisering skal kontrollere den forventede fil og atomisk registrere en outbox-hændelse i databasen. Et afstemningsjob finder overførte filer uden afsluttet registrering og omvendt.

Efterbehandling omfatter filtype/dekodning, serverberegnet hash, metadata, orientation, miniature, større visningskopi og eventuelt en særskilt AI-afledning. Opgaverne har stabil jobidentitet, forsøgstæller, lease, begrænset samtidighed og fejlkø. Genlevering må ikke danne dubletter eller ekstra betalinger for samme analyse. Supabase Queues er en mulig varig transport ved den eksisterende database; en worker skal stadig implementeres og drives. Cloudflare Queues er et alternativ, hvor leveringen som udgangspunkt sker mindst én gang. [Supabase Queues](https://supabase.com/docs/guides/queues/quickstart), [Cloudflares leveringsgarantier](https://developers.cloudflare.com/queues/reference/delivery-guarantees/).

Der bør vælges én transport til første pilot frem for at indføre flere køsystemer samtidig. Den fælles jobkontrakt holdes uafhængig af transporten. Store billeddekodninger skal placeres i en egnet proces; de må ikke antages at kunne køre inden for den normale webrequests ressourcer.

JPEG og HEIC bør indgå i telefonprøven. RAW/DNG, meget store dronefiler og raster opbevares som særskilte aktivtyper; automatiske afledninger kræver en passende decoder/worker. Supabases standardtransformationer har grænser på 25 MB og 50 megapixel og er derfor ikke en universel løsning til hele dronearkivet. [Billedtransformationer](https://supabase.com/docs/guides/storage/serving/image-transformations).

Visninger skal have filtrering pr. opgave/besøg, cursorpagination, kortklynger og begrænsede opslag af private visningslinks. Originaler hentes ved behov. Søgning og kort skal vise, om et resultat er ufuldstændigt; et skjult loft på 500 må ikke ligne hele arkivet. Billed-ID'er og filindhold deduplikeres inden for et afgrænset adgangsscope, mens samme foto fortsat kan have flere legitime opgave-/observationsreferencer.

## Originaler, position og ændringshistorik

Hver original skal have filidentitet, kilde, indholdshash, lagringsreference og relevante tids-/positionsoplysninger. Optagetid fra enheden, EXIF-tid og serverens modtagetid bevares hver for sig. Ved offlineoptagelse må serverens første modtagelse ikke fremstilles som bevis for det præcise optagetidspunkt.

Der skelnes mellem original GPS/EXIF, telefonens positionsmåling med nøjagtighed og måletid, motivets sted og en efterfølgende rettelse. En dronekameraposition er ikke automatisk et motivpunkt eller en billedflade.

Standardreglen er 50 meters rettelse, konfigurerbar af en autoriseret administrator. En rettelse bevarer originalpunktet og registrerer nyt punkt, afstand, årsag, person, tid og anvendt regelversion. Overskridelser kan registreres med synligt afklaringsbehov, så medarbejderen kan fortsætte øvrigt arbejde. Ingen indstilling må omfortolke tidligere rettelser uden en ny version.

Filhash og adgangskontrol gør senere ændringer efterprøvelige inden for den valgte sikkerhedsmodel. De beviser ikke alene, at motivet, tidspunktet eller GPS er sandt. Auditsporet bør være append-only for normale brugere, med særskilt kontrolleret administration, sikkerhedskopiering og dokumenteret genoprettelse. Ekstern signering/tidsstempling kan vurderes ved et konkret afleveringskrav. W3C PROV er et relevant forbillede for forbindelserne mellem kilde, behandling, resultat og ansvarlig; en særskilt grafdatabase er ikke en forudsætning. [W3C PROV-O](https://www.w3.org/TR/prov-o/), [W3C Geolocation](https://www.w3.org/TR/geolocation/).

En genfotograferingsfunktion skal vise det tidligere billede, observationssted, kendt kamerapunkt og eventuel retning. Den skal vise manglende oplysninger og sammenlignelighed, herunder sæson, lys, vandstand og udsnit. To billeder alene dokumenterer ikke, hvilken indsats der blev udført mellem optagelserne.

## Artsforslag, vegetation og øvrig AI

Der bør være udskiftelige analyseadaptere. Artsbestemmelse af enkeltplanter, vegetationsanalyse af oversigtsbilleder, dokumentationskontrol og rapportudkast er forskellige analysetyper med hvert sit vurderingsgrundlag.

Pl@ntNet er en konkret kandidat til første artsintegration: den dokumenterede API tager 1–5 billeder af samme plante og returnerer artsforslag og score. Arters partner-API dokumenterer fund og taksonomi, men ikke adgang til deres billedbestemmelse. Seek/iNaturalist er et nyttigt referenceprodukt; adgang til deres observationsdata er ikke adgang til den fulde artsmodel. [Pl@ntNet API](https://docs.plantnet.org/en/reference/api-plantnet/), [Arters partner-API](https://miljoeportal.dk/nyheder/2025/arterdk-fornyer-sit-partner-api/), [iNaturalists modelarkiv](https://github.com/inaturalist/inatVisionAPI).

Langsigtet dækning af alle planter betyder en bred taksonomimodel og mulighed for flere faglige metoder. Det er ikke et aktuelt kvalitetsløfte om sikker bestemmelse af alle arter. Ukendt, slægt eller artsgruppe er gyldige udfald. Ved utilstrækkelige fotos skal systemet foreslå hvilke nærbilleder, der mangler.

En analyse gemmer sit inputmanifest, kildehash, provider, tidspunkt, parametre, modelversion når tilgængelig, score, alternativer og efterfølgende vurdering. Hvis en ekstern provider ikke udstiller eller fastholder modelversionen, kan samme resultat ikke loves genskabt ved et nyt API-kald; den oprindelige forespørgsel og det oprindelige svar skal kunne efterprøves som gemte resultater.

Modelscore skal evalueres på fagligt mærkede danske billeder, før den præsenteres som kalibreret sandsynlighed. Flere motorers enighed er ikke automatisk uafhængig evidens. Genkendt art, manuel optælling, estimeret dækningsgrad og dokumenteret fravær skal være forskellige værdier. Artsforslag må ikke automatisk tilføje en optælling på ét individ. [Kalibrering af modelscore](https://proceedings.mlr.press/v70/guo17a.html).

Drone-/oversigtsfotos kan indgå i en afgrænset vegetationsmetode og udpegning af kontrolsteder. Artsliste, dækningsgrad, økologisk tilstand og effekt kræver hver sin definerede metode og validering. For vandløbsplanter er AU's tekniske anvisninger et relevant fagligt udgangspunkt. [Gældende anvisninger for ferskvand](https://ecos.au.dk/forskningraadgivning/fagdatacentre/ferskvand).

Rapport-AI må bruge det valgte projektgrundlag og give kildehenvisninger til sine udsagn. Ukendt grundlag skal fremgå. Handleforslag skal vise, hvilke observationer, målinger og faglige regler der støtter dem. Ændrede kilder eller metoder skal markere afhængige vurderinger til genvurdering; tidligere afleveringsversioner bevares.

## Miljødata og kommende sensorer

Eksisterende adaptere og integrationernes kontrakter genbruges. Nye kilder normaliseres med kildeidentitet, periode, geografi, opløsning, enhed, metode, kvalitet og hentetid. DMI, GEUS, Miljøportalen og HIP giver forskellige typer kontekst; et geografisk lag eller en modelværdi må ikke vises som en lokal sensormåling. [DMI](https://www.dmi.dk/frie-data), [HIP](https://hip.dataforsyningen.dk/pages/documentation.html).

| Objekt | Oplysninger, der skal kunne rummes |
| --- | --- |
| Målepunkt | Projekt, sted, relevant vandløb/opland, positionshistorik og højdefikspunkt, hvor relevant |
| Sensor/instrument | Identitet, model, ejer, installation, service og kalibrering |
| Måleserie | Målt egenskab, enhed, metode, tidsreference, opløsning og kvalitetsregler |
| Observation | Faktisk måletid, modtagetid, råværdi, kilde-ID, kvalitet og eventuel korrektionsreference |
| Kalibrering/korrektion | Gyldighedsinterval, metode, ansvarlig og bevaret råværdi |

En vandstandslogger kan måle relativ dybde eller en højde i en bestemt reference. Serierne må kun sammenlignes efter en dokumenteret omregning. Ilt i mg/L og iltmætning i procent er forskellige egenskaber; temperatur og kalibrering kan være nødvendige støtteoplysninger. Udfald, forsinkede observationer og måleusikkerhed vises; manglende værdier er ikke nul.

Første adapter kan være en konkret loggers CSV-eksport, efterfulgt af dens API. Leverandørspecifikke API'er, MQTT eller LoRaWAN kan senere kobles til samme kontrakt. OGC SensorThings giver en relevant standardmodel for sensor, måleserie og observation; det betyder ikke, at alle leverandører allerede tilbyder den. [OGC SensorThings](https://docs.ogc.org/is/18-088/18-088.html).

## Godkendelse, rapport og dokumentationskrav

Den ansvarlige medarbejder kan færdiggøre sin opgave og sende en usikker observation til ekstra vurdering. Accept og efterfølgende vurderinger registreres med person, rolle, kompetence hvor relevant og omfang; en medarbejderaccept er ikke automatisk en ekspertvurdering. Andre registreringer, upload og rapportkladder kan fortsætte. En åben faglig sag følger det relevante udsagn og bliver synlig i afleveringen. Den bliver ikke lydløst en godkendt konklusion.

En rapportpakke skal indeholde valgte registrerings-/kildeversioner, fotoreferencer, analyseversioner, metode, aktører, rettelser, åbne punkter og et manifest med filhashes. Modtageren kan få både en redigerbar kladde og en fast afleveringsversion. Senere redigering giver en ny revision; den allerede afleverede pakke bevarer sit grundlag.

"Højeste krav" operationaliseres som konkrete kravprofiler: fx kommunal aflevering for Bykær, et aftalt naturtilsyn eller en dokumentationspakke for byggeri. Profilen definerer nødvendige oplysninger, metode, kompetence, kontrol og eksport. Et audit trail giver ikke automatisk accept efter alle faglige eller myndighedsmæssige krav. De relevante modtagere skal afprøve en konkret aflevering.

Et projekttilvalg må ikke i sig selv give adgang til alle organisationens øvrige projekter. Kommune, udførende og lodsejer får kun den aftalte adgang. Ved deling vælges mellem løbende arbejdsrum og en bestemt afleveringsversion. Behov for begrænsning af følsomme lokaliteter og adgang til originale filer indgår i profilen.

Databasen og originalfilerne skal sikkerhedskopieres og genoprettes samlet i en isoleret prøve. Supabases databasebackup omfatter ikke selve Storage-filerne. En databasegendannelse alene er derfor utilstrækkelig til et fotoarkiv. [Backupomfang](https://supabase.com/docs/guides/platform/backups).

## Import og gradvis overgang fra Skyhost

En rigtig Excel-eksport er nødvendig for at fastlægge kolonnemapping og billedkoblinger. Importmotoren skal kunne skelne mellem indlejrede billeder, links og selvstændige originalfiler. Der må ikke antages bestemte kolonnenavne eller et bestemt koordinatsystem, før materialet er læst.

Anbefalet forløb: identificér eksportformat → vis mapping og fejl → bevar kildesystem/kilde-ID → knyt billeder til opgaver og steder → vis importkladde → godkend registreringerne. Genkørsel må ikke danne dubletter. Kildens tidszone, positionskilde og valideringsbetydning skal bevares.

Historiske billeder kan indlæses med deres faktiske dokumentationsniveau. En manuelt placeret post eller et billede udtrukket fra et ark bliver ikke en verificeret kameraoriginal af at blive importeret.

Skyhost beskriver API-adgang, men de nødvendige foto-, original- og jobkortfunktioner er endnu ikke bekræftet. Brug først filimport, og gå videre med en læsende integration, når dokumentation og adgang er afklaret. Driftweb er et yderligere integrationsspor fra tidligere brugerbeslutninger; der er ikke udført en API-undersøgelse af Driftweb her. [Skyhost API](https://skyhost.dk/kundeservice-erhverv/).

## Moduler og økonomi

| Produktdel | Anbefalet indhold |
| --- | --- |
| Fælles dokumentationskerne | Projektadgang, originaler, kildehistorik, grundlæggende registrering og udtræk af egne data |
| Felt og jobkort | Skabeloner, tjeklister, tildeling, offlinekø og gentagne besøg |
| Natur og arter | Artsforslag, faglig gennemgang og validerede vegetationsmetoder |
| Drone og sammenligning | Droneindlæsning, gentagelser, før/efter og særskilt raster-/fotogrammetriintegration |
| Målinger og sensorer | Loggerimport, datakilder, tidsserier og kvalitetskontrol |
| Branchepakker | Vandløb, byggeri/natur og græsningspleje med udvalgte skabeloner og moduler |

Dette er en produktmodel til vurdering, ikke fastlagte priser. Pakker kan inkludere moduler, der også sælges separat. Licens, rolle og faktisk forbrug er forskellige begreber og skal kontrolleres på serveren. Nedgradering bør bevare læse-/eksportmuligheden til kundens eksisterende dokumentation efter aftalte vilkår.

Den vigtigste løbende økonomi er originalopbevaring, backup, download, billedafledninger, AI-kørsler, kort/offlinekort og driftsarbejde. Undgå automatisk analyse af hele det historiske fotoarkiv. Brug opgavebaseret valg, genbrug af eksisterende analyser og forbrugslofter. Der er ikke beregnet et endeligt driftsbudget eller bestilt tjenester.

## Tre udvalgte YouTube-referencer

Udvalgt efter relevans for Freyra og dokumenterbart indhold. Offentlige beskrivelser/kapitler og officielle dokumentationssider er undersøgt. Videoerne er ikke afspillet eller transskriberet i denne analyse. De ældre videoer bruges til principper; aktuelle produktgrænser kontrolleres i nutidige dokumenter.

| Reference | Dokumenteret fokus | Anvendelse i Freyra |
| --- | --- | --- |
| [ArcGIS Field Maps Offline - Episode 17 - Spatial Report](https://www.youtube.com/watch?v=UvA4hf1aoQ0), Esri Canada | Offlineopsætning, synkronisering og feltredigering; offentlige kapitler henviser bl.a. til 2:19, 5:37 og 7:03 | Download af valgt arbejdsområde, klare lokale/serverstatusser og synkroniseringsflow |
| [ArcGIS Field Maps: Creating and Using Smart Forms](https://www.youtube.com/watch?v=_M29_CGLQ_k), Esri Events | Grupper, inputtyper, obligatoriske/låste felter og betinget visning | Enkle skabeloner med relevante felter. Versionsbinding er vores anbefaling til Freyra, ikke en påstand om videoens indhold |
| [Supabases video om genoptagelig upload med Uppy og TUS](https://www.youtube.com/watch?v=pT2PcZFq_M0), Supabase | Upload i dele, genoptagelse og klienteksempel; offentlige kapitler fra 00:36–01:30 | Individuel filstatus, begrænset samtidighed og fortsættelse efter udfald. Linkteksten er beskrivende; den præcise videotitel var ikke tilgængelig i indekset |

Esris [officielle sessionsoversigt](https://www.esri.com/arcgis-blog/products/apps/field-mobility/arcgis-field-operations-dev-summit-2021-technical-session-videos) underbygger formularindholdet. Supabases [officielle artikel](https://supabase.com/blog/storage-v3-resumable-uploads) underbygger uploadprincipperne. [Aktuel Field Maps-dokumentation](https://doc.arcgis.com/en/field-maps/latest/prepare-maps/configure-the-map.htm) beskriver også billednedskalering, hvilket gør adskillelsen mellem original og visningskopi relevant. Disse referencer er inspiration; der kopieres ikke leverandørkode eller design.

## Afhængighedsordnet byggeforløb

Dette er et forslag til næste arbejde. Byggepakkerne udføres ikke som del af analysen.

| Pakke | Konkret leverance | Forudsætning og afslutningsbevis |
| --- | --- | --- |
| A. Datakontrakt og afstemning | Kortlæg gamle mediespor, relationer, roller og job-/besøgsobjekter; fastlæg original- og statusbetydning | Genbrug F00 og eksisterende kontrakter; eksplicit mapping og kompatibilitet med rapportreferencer |
| B. Importprøve og skabeloner | Første jobkort, versionsgemte felter og importmapping | En faktisk eksport fastlægger mapping. Manglende eksport stopper kun denne del; skabelonarbejde kan fortsætte |
| C. Original og upload | Fælles kvitteret overførsel, separate positioner, 50-meterregel og bilagsrelationer | Afbrudt overførsel og genkørsel bevarer identitet; felt- og droneoriginaler kan efterprøves |
| D. Varig efterbehandling | Outbox, worker, thumbnails, metadata, hash, retries og fejlkø | Kontrolleret crash/genlevering skaber ikke tab eller dubletter |
| E. Mobil og offline | Varig lokal kø, pladsstyring, opgavepakke, konfliktvisning og genstart | Fysisk iPhone-/Android-prøve; platformens baggrundsadfærd dokumenteres |
| F. Arkiv og skala | Pagination, kortaggregation, filtrering og efterspurgte visningskopier | 200-foto-opgave og 1.000-foto-dag afprøves med voksende historik |
| G. Analyse og aflevering | Artsadapter, medarbejdervurdering, ekstra review, før/efter og versionsbundet rapport | Fagligt mærket materiale og en konkret modtager gennemgår forløbet |
| H. Logger og sensorer | Én faktisk loggerimport samt generisk måle-/kvalitetskontrakt | Kendt enhed, tidsreference, referencehøjde og genindlæsning uden dubletter |
| I. Produktpakker og drift | Modulrettigheder, forbrug, backup og genoprettelsesprøve | Adgang prøves på tværs af organisationer; samlet database- og filrestore dokumenteres |

Bykær er den første komplette anvendelse. Byggeri/natur og græsningspleje får efterfølgende skabeloner og de nødvendige faglige objekter. Arbejde fra eksisterende pakker skal genbruges frem for at tælles som en ny parallel løsning. Ingen pakke får en færdigstatus alene ved grøn lokal test.

## Forslag til acceptprøver

Disse er planlagte kriterier, ikke udførte eller beståede prøver.

| Prøve | Hvad der skal demonstreres |
| --- | --- |
| 200 fotos på en opgave | Registreringer og originaler forbliver knyttet korrekt uden 20-bilagsloft eller tavst bortfald |
| 1.000 fotos på tværs af dagen | Flere medarbejdere/opgaver, målte ventetider og fuldstændigt slutregnskab over filer og fejl |
| Offline og genstart | Allerede lokalt kvitterede fotos og felter overlever app-/telefongenstart |
| Afbrudt og udløbet upload | Fortsættelse eller ny session bevarer fotoidentitet; tabt serverrespons kan genfindes |
| Lav lagerplads | Brugeren får tydelig status før en mislykket registrering; ingen falsk lokal gemmekvittering |
| HEIC og drone-JPEG | Originalhash bevares; orientation og afledninger er korrekte; ikke-understøttede formater vises tydeligt |
| Positionsrettelse | Original og rettelse kan genfindes; 50-meterregel og ændret organisationsregel er versionsbundet |
| To samtidige medarbejdere | Nye fotos flettes; konkurrerende rettelser til samme objekt overskrives ikke lydløst |
| Tilbagekaldt adgang | Nye serveroperationer afvises; lokal restkø forbliver synlig og isoleret fra andre projekter |
| Skabelonændring | Et gammelt offlinebesøg kan læses efter sin oprindelige skabelon |
| AI og faglig tvivl | Forslag, optælling og vurdering er adskilt; ekstra review stopper ikke øvrig registrering |
| Loggerimport | Rådata, tidszone, enhed, udfald og korrektion kan efterprøves; genimport er idempotent |
| Rapport og kildeændring | En tidligere aflevering bevarer sit grundlag; berørte nye vurderinger markeres til genvurdering |
| Genoprettelse | Database, originaler og manifest gendannes og kontrolleres i isoleret miljø |

De endelige service- og svartidsmål fastlægges efter måling med repræsentative filer, enheder og net. Før pilotafprøvning vælges de konkrete kriterier; der loves ikke en målt kapacitet på baggrund af scenarieberegninger.

## Kilder og kodehenvisninger

Aktuelle brugerbeslutninger i denne samtale styrer produktkravene. Tidligere materiale er brugt til at finde genbrug og sammenhæng, ikke som nyt driftsbevis.

- [Tidligere projektcase om verificerbar evidenskæde](https://docs.google.com/document/d/1P7vA8IecPg46YP-Ph0ordTZxjtZ5K7HZEw6YgXFt9mw/edit?usp=drivesdk).
- [Tidligere Freyra-arbejdsbog](https://docs.google.com/spreadsheets/d/15PHNlJHaMtph7nPe2td6unlTx6UtNYHdz73Mg1rmMeo/edit?usp=drivesdk).
- [Udviklingsplanens kendte reference](https://github.com/JESRI-C/Freyra/blob/b5cd3aec50247ba0d20f415e1cfce967ee7e300b/docs/Freyra_Codex_udviklingsplan_v1.md), lokal status i [PAKKESTATUS.md](PAKKESTATUS.md), [F00_AFSTEMNING.md](F00_AFSTEMNING.md) og [integrationskontrakt](4dm-project-monitor-integrations.md).
- `src/services/actions-service.ts:38`, `src/services/action-execution-service.ts:17` og `src/lib/action-execution.ts:28`: opgaver, udførelse og bilagsgrænse.
- `supabase/migrations/20261028153415_freeze_workflow_report_inputs.sql:27`: SQL-validering af bilagsgrænse.
- `src/services/monitoring/uploads-service.ts:294` og `src/services/monitoring/resumable-upload-service.ts:3`: upload-intent, TUS og finalisering.
- `src/components/monitoring/drone-before-batch-helpers.ts:1`: dronebatch og samtidighed.
- `src/services/project-media-service.ts:282`, `:318` og `:427`: medieindlæsning, kortloft og almindelig feltupload.
- `src/components/project-workspace/ProjectMediaUploadPanel.tsx:126`: EXIF-position og redigerbare koordinater.
- `src/components/monitoring/SpeciesRecognitionFlow.tsx:76` og `src/lib/species-id.functions.ts:46`: gemning af AI-forslag og generel modelinstruks.
- `src/services/baseline/public-monitoring-stations-source.ts:47` og `src/services/sensors-service.ts:1`: stationsinventar og sensoroversigt.
- `src/services/workflow-report-service.ts:114` og `src/services/report-document-service.ts:109`: eksisterende rapportgrundlag.
- `src/components/workspace/AccountSettingsPage.tsx:54`: nuværende modulvisning.
- `supabase/migrations/003_construction_nature_compliance.sql:7`: byggeri som projektudvidelse.

## Afklaringer der påvirker de relevante byggepakker

En repræsentativ Skyhost-Excel-eksport og de tilhørende billedfiler mangler fortsat. API-dokumentation for foto-/jobkortadgang, én konkret loggertype, repræsentative telefoner/billedfiler og modtagerens afleveringskrav skal indgå i de respektive prøver. Disse forhold forhindrer ikke arbejdet med den fælles model, men de afgrænser hvad der kan kaldes afprøvet og færdigt.
