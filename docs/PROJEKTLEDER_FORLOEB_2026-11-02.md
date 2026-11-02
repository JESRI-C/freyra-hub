# Fra naturproblem til dokumenteret indsats

2. november 2026 · Projektlederens brugerforløb · Opfølgning på faktisk brugerprøve.

**Samlet omfang:** Denne indgang er en del af [fuld kortlagt Skyhost Jobs-/Geotag-paritet](SKYHOST_PARITET_OG_RESTARBEJDE_2026-11-02.md).
Kalender, gentagelser, timer, materialer, booking, ruter og opsætning er
påkrævede dele af den samlede leverance. De er ikke implementeret af en ny
indgang eller et nyt forklarende trin.

## Produktets formål

Freyra skal hjælpe en projektleder med at forstå et naturproblem, planlægge
en indsats, følge det udførte arbejde og samle grundlaget for at vurdere og
forklare resultatet. Fotos og registreringer har deres formål i den konkrete
opgave og den efterfølgende vurdering.

Eksempel: En eng gror til. Projektlederen beskriver målet, undersøger
området, planlægger plejen, følger udførelsen, sammenholder før og efter og
samler dokumentationen. Eksemplet er ingen faglig vurdering af et faktisk
areal og dokumenterer ingen natureffekt.

## Fund i den tidligere indgang

- Projektlisten åbnede billeder som standard i det kommunale workflow.
- Overblik begyndte med droneindtag, geometri, tællere og en løs anbefaling.
- Formålsbeskrivelsen lå under avancerede indstillinger ved oprettelse.
- Opgaverne havde to synlige betjeninger, der viste de samme poster.
- De enkelte opgavetrin forklarede ikke tydeligt, hvad brugeren fik ud af dem.

Teknisk gennemførelse af foto/upload/kobling var afprøvet, men Jespers
brugerprøve fandt fortsat formål og betjening forvirrende. Den tilbagemelding
genåbner brugeraccepten i S01/S11. Grønne automatiske kontroller lukker den
ikke.

## Det samlede forløb

| Trin | Brugerens spørgsmål | Eksisterende funktion, som genbruges |
|---|---|---|
| Problem og mål | Hvad skal forbedres, og for hvem? | Projektbeskrivelse og eksisterende projektredigering |
| Forstå området | Hvad ved vi om stedet? | Afgrænsning, offentligt grundlag og kilder |
| Planlæg indsatsen | Hvem gør hvad og hvordan? | Samme opgaver, planer, ansvar og revisioner |
| Følg udførelsen | Hvad er faktisk gjort? | Udførelsesversioner, feltregistreringer og dokumentationskobling |
| Vurdér ændringen | Hvad viser før og efter? | Eksisterende sammenligning og faglig vurdering |
| Saml dokumentationen | Hvad kan vi aflevere? | Eksisterende rapporter, kilder, mangler og opfølgning |

Trinnene er en arbejdsrækkefølge med genveje. De er ikke afkrydsede
færdigmeldinger. En gemt beskrivelse er ikke en godkendt plan, udført
arbejde er ikke i sig selv dokumenteret natureffekt, og en rapportknap
betyder ikke, at en komplet frossen aflevering er implementeret.

## Konkret ændring

Projektlisten åbner nu projektets overblik som standard. Direkte gamle
links til billeder og øvrige værktøjer virker fortsat. Projektets formål
vises med en konkret redigeringsindgang, og oprettelse spørger direkte til
problem og mål. Den eksisterende beskrivelsestekst bevares ordret; ingen
automatisk konvertering eller ny tabel er indført.

Projektets seks trin bruger fælles destinationsmapping. Opgave- og
rundeidentitet følger med, mens et gammelt valg af editor ryddes ved valg
af et nyt trin. Plan og udførelse åbner samme arbejdsrum med den relevante
visning. Videre-knapper mellem opgavens dele bevarer de monterede editorer
og kladdernes eksisterende låse.

Værktøjskatalog, målinger, droneindtag og den eksisterende opgaveliste
bevares i tydelige foldbare indgange. Projektets aktuelle arbejde får
pladsen først. Opgavens fire dele forklarer deres formål og sammenhængen
mellem plan, observation, udførelse og dokumentation.

## Accept, som afgør næste prioritet

[Åbn projektlederens eksempelsag på staging](https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev/app/projects/a10ba97f-3c1b-4244-b2ca-3ac0fd1b476e?tab=overblik)
med det eksisterende testlogin. Sagen hedder **Prøvesag · Pleje af en
tilgroet eng (ae625ab0)**. Den indeholder problem, mål og en gemt plan for
opgaven **Besigtig engen og beskriv udgangspunktet (eksempel)**. Der er ikke
registreret en virkelig besigtigelse, pleje eller natureffekt. Den tidligere
tekniske foto-/offlineprøvesag er bevaret.

Under Feltregistrering kan den gemte skabelon **Besigtigelse før naturpleje
(eksempel)** vælges. Den spørger til sted, udgangspunkt og hensyn. Der er
ikke lagt opdigtede feltbesvarelser ind.

Jesper skal med en konkret sag kunne forklare:

1. Hvilket problem projektet handler om, og hvad målet er.
2. Hvad næste relevante handling er, og hvor den foretages.
3. Hvorfor et foto eller en registrering bliver gemt, og hvilken opgave det underbygger.
4. Hvad der er planlagt, hvad der faktisk er udført, og hvad der stadig er ukendt.
5. Hvad materialet kan bruges til ved faglig vurdering og aflevering.

Prøven skal gennemføres uden en udviklers klik-for-klik-vejledning. Hvis
det fortsat er uklart, rettes det observerede brud, før næste brede
integrationspakke sættes foran brugerforløbet. De eksisterende rapport-,
afleverings- og reviewmangler i S04/D05/S05/D07 er fortsat åbne.

## Kontrolleret leverance

Appkilde `c93ad0309da4a6b5fa1d43c9d7a278ae8945c510` er deployet på staging
som Worker-version `081e2eeb-b7df-473e-80f7-19a83c0ffa02`; offentlig
buildmetadata matcher. Ingen skemaændring, merge eller produktionsændring.

[CI 41441077355](https://github.com/JESRI-C/freyra-hub/actions/runs/41441077355)
bestod begge jobs: 3.373 app-tests i 250 filer, 1.471 databasekontroller i
22 filer, typecheck, lint, tom migration, samtidighed, restore, billeddekodning
og build. Lokale afgrænsede navigation-/komponentprøver bestod; lokal fuld
typecheck blev afbrudt af hukommelsesmangel og tæller ikke som bestået.
Den fulde kontrol bestod i CI. Den særskilte lokale staging-build bestod.

Hosted Chrome bestod ny oprettelse med synligt formålsfelt og læsning af
gemt formål, standardindgang til overblik, opgave/plan, Videre-knap med
bevaret kladde, samme opgave ved udførelsesgenvej og routing til grundlag,
sammenligning og rapport. Den konkrete feltregistreringsskabelon kunne
vælges og viste de rigtige spørgsmål uden gemte opdigtede observationer.
320/390 pixels havde intet vandret overløb, og den primære knap var mindst
44 pixels høj. Skærmbilleder er gennemgået. Fysisk telefon og Jespers nye
brugbarhedsprøve er fortsat åbne.

Den gentagelige prøve ligger i `scripts/test-project-leader-journey-staging.mjs`.
Den kræver `--staging`, kontrollerer miljø og den mærkede eksempelsag og
genbruger private testcredentials i ignoreret tmp. Tilstanden og
skærmbillederne ligger i `tmp/project-journey/`. Der sendes ingen beskeder,
og eksisterende originaler eller testprojekter overskrives ikke.
