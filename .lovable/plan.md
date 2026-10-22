# Freyra: visuel designgennemgang (kun UI, kun rådgivning)

Rådgivning. Der ændres ingen filer, ingen gren og der deployes intet. Implementeringen sker i JESRI-C/freyra-hub på `codex/redesign-2710` (fra demo-grenens 6257819). main og demo-grenen skal ikke røres.

## Vurdering af retningen

Retningen holder. To menupunkter, én startside med fem valg og en sag i seks trin kan forstås på 10 sekunder. Der er tre risici:
1. **Genveje uden sag.** "Upload dronefotos" kan ende i en tom eller forkert sag. Derfor skal brugeren altid vælge en sag først (se forbedring 3).
2. **"Resultat først" kan skjule usikkerhed.** Dækning, ukendt areal og manglende faglig accept skal stå *i* resultatkortet og ikke inde i Avancerede indstillinger.
3. **Kontrast.** Mellemgrøn #66A182 på beige når ca. 2,9:1. Den må kun bruges til flader, ikoner og kanter, aldrig til tekst. Tekst og knapper bruger #27543D (ca. 8:1 på beige).

## Tokens (justering af trin 1)

```text
--background  oklch(0.965 0.008 90)   beige (flyttes fra sidebar til hele appen)
--card        oklch(0.99 0.004 90)    let lysere kort, så de skiller sig ud fra baggrunden
--primary     #27543D                 knapper, aktiv menu, links
--brand-mid   #66A182                 kun ikoner/fyld/kanter
--foreground  #2A2E35
--muted-foreground  oklch(0.48 0.01 260)  (>= 4.5:1 på beige)
--radius      6px  (0.375rem)
Overskrifter  Source Serif 4 500: H1 32/40 (mobil 26/32), H2 22/28, H3 18/24
Brødtekst     Helvetica Neue 16/24, hjælpetekst 14/20, labels 13/18 600
Afstand       4-grid: 8 / 12 / 16 / 24 / 32 / 48
```

## Forbedringer

### 1. Hovedmenu: kun "Sager" og "Kilder"
- 1440px: fast venstremenu på 240px. Logo "Freyra" i Source Serif 20px, padding 24px. Menupunkterne er 44px høje med radius 6px, og det aktive punkt har baggrund #27543D og lys tekst. Nederst står en diskret linje: "Indstillinger · Hjælp · Log ud" (14px).
- 375px: topbjælke på 56px med "Freyra" til venstre og en menuknap (44×44, aria-label "Åbn menu") til højre. Menuen åbner som et ark med de samme to punkter.
- De øvrige moduler fjernes fra menuen men slettes ikke. De kan nås fra sagens trin eller fra Kilder. Ingen funktion forsvinder.

### 2. Startside "Hvad vil du gøre?"
```text
1440: max-bredde 1120, top-padding 48
H1  Hvad vil du gøre?
p   Freyra samler dronefotos og offentlige data for et naturprojekt,
    så du kan dokumentere baseline og aflevere en sporbar rapport.   (18/28, max 64ch)
Gitter 3+2 kort, gap 16, hvert kort min-højde 148, padding 24
```
Kortene (titel 18px 600 og én sætning på 15px):
- **Start en ny sag**: "Opret en sag for et område, og følg de seks trin fra billeder til rapport."
- **Upload dronefotos**: "Læg fotos ind i en sag. Position og tidspunkt læses fra filerne."
- **Se baseline**: "Se, hvad der er dokumenteret i området, før projektet går i gang."
- **Find steder at plante træer**: "Se arealer, hvor data peger på mulig beplantning, til faglig vurdering."
- **Hent rapport**: "Hent rapporten for en sag med kilder, mangler og godkendelsesstatus."

"Start en ny sag" er det eneste kort med fyldt primærfarve. De andre er lyse kort med 1px kant. Under 640px vises kortene i én kolonne med 12px mellemrum, og hele kortet kan trykkes (mindst 72px højt).

### 3. Genveje kræver valg af sag
Klikker man på et af de fire andre kort, åbner en dialog. På 375px er det et ark fra bunden.
- Titel: "Vælg sag"
- Tekst: "Vælg den sag, du vil uploade dronefotos til." (verbet følger kortet)
- En liste med søgefelt "Søg efter sagsnavn eller adresse". Hver række viser sagsnavn, adresse og aktuelt trin.
- Knapper: [Fortsæt] er inaktiv, indtil en sag er valgt. Sekundært link: "Start en ny sag i stedet".
- Ingen sag vælges automatisk, heller ikke den senest brugte. Den kan højst stå øverst med mærket "Senest åbnet".

### 4. Sagens topbjælke: seks trin, status og én næste-knap
```text
1440: [Sagsnavn H1 26px] adresse 14px muted          [Næste: Hent datagrundlag ->]
      1 Billeder ✓  2 Datagrundlag ●  3 Verificering  4 Baseline  5 Beplantning  6 Rapport
      trinbjælke 56px, hvert trin = nummer-cirkel 24px + label 14px + statuslinje 13px
```
- Statusser (ikon + tekst, aldrig kun farve): "Færdig", "I gang", "Mangler data", "Afventer faglig accept", "Ikke startet".
- Der er altid kun én primærknap pr. skærm, og teksten viser den konkrete handling, fx "Næste: Verificér 3 punkter". Tallet kommer fra data. Hvis tallet ikke kendes, står der ikke noget tal.
- 375px: titlen står på én linje og kortes af med "…". Under den står "Trin 2 af 6 · Datagrundlag · I gang", og et tryk åbner listen over trin. Næste-knappen ligger i en fast bundbjælke på 64px plus sikker zone, i fuld bredde.
- Trinene er aldrig låst. Et trin, der ikke er færdigt, kan åbnes, men viser hvad der mangler.

### 5. Resultat først, parametre under "Avancerede indstillinger"
Rækkefølgen på hvert trin (Datagrundlag, Baseline, Beplantning):
1. **Resultatkort** (padding 24): hovedresultatet og lige under det en **dækningslinje**, fx "Kilder: 4 af 6 hentet · Ukendt areal: vises på kortet". Værdierne kommer altid fra data, og hvis de mangler, står der "Ikke beregnet endnu".
2. Kort og tabel.
3. `Avancerede indstillinger` er foldet sammen (chevron, 44px trykflade). Hver parameter har en label, standardværdien som hjælpetekst ("Standard: …") og en sætning på 14px om, hvad den påvirker. Nederst står linket "Nulstil til standard" med bekræftelsen "Alle indstillinger på dette trin sættes tilbage til standard. Resultatet beregnes igen." Ændrede parametre markeres med "Ændret" og en prik, også når boksen er foldet sammen ("Avancerede indstillinger · 2 ændret").
Alle eksisterende parametre beholdes. De bliver kun flyttet.

### 6. Usikkerhed skal kunne ses
- **Ukendt areal**: skraveret mønster på kortet med signaturen "Ukendt – ingen data" og arealet angivet, hvis det er beregnet.
- **Delvis kildedækning**: en ravgul bjælke over resultatet: "Resultatet bygger på 4 af 6 kilder. Mangler: GEUS, Miljøportalen." [Se kilder]
- **Faglig accept mangler**: resultatet får mærket "Afventer faglig accept" med stiplet kant. I rapporten står: "Ikke fagligt godkendt". Systemet sætter aldrig selv godkendt-status.
- Eksempeldata og antagelser: mærket "Eksempel – ikke målt for denne sag" eller "Antagelse – skal bekræftes af fagperson". De tælles aldrig med i resultater.

### 7. Aktivitetsbakke kun som visning
- 1440px: højre panel på 320px, som kan foldes ind. 375px: knap i topbjælken "Aktivitet (3)", der åbner et ark.
- To sektioner: **Det mangler** (konkrete punkter med link til trinnet) og **Seneste arbejde** (faktiske hændelser fra revisionssporet med tid og person).
- Der er ingen knapper til at udføre handlinger i bakken, kun links til trin. Er der ingen hændelser, står der: "Der er ikke registreret aktivitet på sagen endnu."

### 8. Login
- Overskrift: "Log ind på Freyra"
- Undertekst: "Sporbar dokumentation af naturprojekter – fra dronefoto til godkendt baseline."
- 1440px: centreret kort på 420px på beige baggrund. 375px: fuld bredde med 16px margin og felter på 48px.

## Skærmstruktur

```text
1440 (arbejdsplads, fx 24" skærm)
+-------+------------------------------------------+-----------+
| Menu  | Sagsheader + trinbjælke + Næste-knap     | Aktivitet |
| 240px | Indhold max 960px, padding 32            | 320px     |
+-------+------------------------------------------+-----------+

375
+-----------------------------+
| Freyra            [Menu]    |  56
| Sag · Trin 2 af 6           |  48
| Indhold, padding 16         |
| ...                         |
| [ Næste: … ]  (fast bund)   |  64 + safe-area
+-----------------------------+
```

## Trin og eksisterende funktioner

| Trin | Bygger på |
|---|---|
| 1 Billeder | Upload center, projektmedier, EXIF/GPS |
| 2 Datagrundlag | Projektområde, kildeopslag (§3, GEUS, NDVI, kulstof, vand) |
| 3 Verificering | Datakvalitet, artsgenkendelse, alerts som punkter |
| 4 Baseline | Eksisterende indikatorer og miljøkort, samlet visning |
| 5 Beplantning | Kort og zoner, eksisterende analyser som forslag |
| 6 Rapport | Rapportbygger, godkendelse, revisionsspor, eksport |

Der opfindes ingen nye beregninger. Hvor der ikke findes en funktion i dag (fx en egentlig træplantningsanalyse), viser trinnet de eksisterende data og en tom tilstand: "Freyra beregner ikke plantningsegnethed endnu. Brug kortet og datagrundlaget til din vurdering."

## Antagelser, der skal bekræftes
- "Kilder" i menuen svarer til det nuværende register over data og metoder.
- "Baseline" er en ny samlet visning af eksisterende data og ikke en ny beregning.
- Planen for fem trin bliver erstattet af denne plan med seks trin.
