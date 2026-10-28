> Historisk designplan. Gældende udviklingsreference er
> [F00 og pakkestatus](../docs/F00_AFSTEMNING.md). Før/efter og dokumenteret
> udførelse prioriteres; plantning er valgfri. Eksisterende navigation bevares.

# Freyra: én sag i fem trin (designplan)

Denne plan er kun et designforslag. Den ændrer ingen filer, ingen data og publicerer ikke noget. Den kan bygges ovenpå de funktioner, der findes i dag.

## 1. Hvad gennemgangen viste

- Sidemenuen har 5 grupper med 16 punkter (Dashboard, Naturprojekter, Kort & zoner, Byggeri & natur, Monitoring, LavbundsMRV, Project Intelligence, Dokumentation & audit, Funding & impact, Public impact, System Test m.fl.). En kommunal fagbruger får ingen hjælp til at vide, hvor han skal begynde.
- Navnet "GoFreyra" og engelske betegnelser ("Funding & Impact Potential", "Documentation & Audit Trail", "Project Intelligence") står side om side med dansk tekst.
- Hvert modul har sin egen fanebjælke (impact, ledger, lavbund, connect, projektside), og der er intet fælles flow på tværs af dem.
- Der findes ingen side til beplantning i dag. Trin 4 skal derfor bygges som noget nyt.
- Flere sider viser tal fra eksempeldata (`platform-seed`, `lavbundMockData`, `impact-data`, `ledger-data`, `reports-data`) på samme måde som rigtige resultater.
- Farver og afstande ligger i `styles.css`, men en del steder bruges faste farver som `text-white` og `bg-success text-white`.

## 2. Ny struktur

```text
Sager (liste)  ->  Sag: [1 Billeder]-[2 Datagrundlag]-[3 Gennemgang]-[4 Beplantning]-[5 Rapport og aflevering]
```

**Sidemenuen bliver kortere:**
- Sager
- Ny sag
- Opgaver til mig
- (nederst) Indstillinger · Hjælp

Moduler, der ikke hører til forløbet (Funding & impact, Public impact, Byggeri & natur, LavbundsMRV, Project Intelligence, System Test, Monitoring-fanerne), forsvinder fra menuen. De kan stadig slås til under *Indstillinger → Moduler* for organisationer, der skal bruge dem. Ingen funktioner bliver slettet.

**Hvor de nuværende funktioner ender:**

| Trin | Bygger på |
|---|---|
| 1 Billeder | Upload center (billeder, drone, GPS/EXIF), projektmedier |
| 2 Datagrundlag | Projektområde/kort (geometry), datakilder, §3, GEUS, NDVI, kulstof, vandmiljø |
| 3 Gennemgang | Datakvalitet, artsgenkendelse, alerts (som "punkter til gennemgang"), noter |
| 4 Beplantning | Nyt: arter, mængder, placering på kort, plejeplan |
| 5 Rapport og aflevering | Rapport-builder, godkendelse, revisionsspor (ledger), eksport |

**Adresser:** `/app/sager`, `/app/sager/$id/billeder` · `/datagrundlag` · `/gennemgang` · `/beplantning` · `/rapport`. De gamle adresser sender videre til de nye.

## 3. Skærmene

### Sagsoversigt (`/app/sager`)
- Overskrift "Sager" og en primærknap "Opret ny sag".
- Filtre: Status (Kladde, I gang, Afventer data, Klar til aflevering, Afleveret) · Ansvarlig · Søg.
- Tabel på desktop og kort på mobil: sagsnavn, adresse/matrikel, aktuelt trin (x af 5), antal datamangler, senest ændret, næste handling som link.
- Tom liste: "Du har ingen sager endnu. Opret en sag for at uploade billeder og hente data for området." og knappen [Opret ny sag].

### Sagsramme (gælder alle fem trin)
**Desktop (fra 1024px):**
```text
+--------------------------------------------------------------------+
| Sagsnavn · matrikel          Status-badge     [Næste handling ->]  |
| (1)Billeder ✓ —(2)Datagrundlag ●—(3)Gennemgang—(4)Beplantning—(5)  |
+--------------------------------------+-----------------------------+
| Trinindhold (maks. 880px)            | Sidepanel 320px:            |
|                                      |  - Det mangler (liste)      |
|                                      |  - Sagsoplysninger          |
|                                      |  - Seneste aktivitet        |
+--------------------------------------+-----------------------------+
```
**Mobil (under 768px):**
- Kompakt topbjælke med sagsnavn og "Trin 2 af 5 · Datagrundlag", som åbner en trinliste.
- Indholdet ligger i én kolonne. "Det mangler" vises som et kort, der kan foldes ud, øverst.
- En fast bundbjælke med den primære handling, mindst 48px høj og med plads til sikker zone.

Trinene kan altid åbnes. Hvis man springer et trin over, står der "Ikke færdigt" ved det. Man bliver ikke låst ude.

### Trin 1 – Billeder
- Træk filer ind i feltet, eller brug "Tag billede" på mobil.
- Billederne vises i et gitter med et mærke: "Har GPS-position" eller "Mangler position".
- Under gitteret ligger et lille kort, hvor billederne er placeret efter position.
- Færdigt, når der er mindst 1 billede og alle billeder har position eller er placeret manuelt.

### Trin 2 – Datagrundlag
- Projektområdet tegnes på kortet, eller matriklen vælges.
- Kortet med datakilder viser for hver kilde en af disse statusser: Hentet / Henter / Ikke tilgængelig / Fejl, og hvornår den sidst blev opdateret.
- Knappen "Hent data for området" kører hele analysen og viser fremdriften trin for trin.

### Trin 3 – Gennemgang
- En liste med punkter, der skal tages stilling til: datakvalitet, foreslåede arter, afvigelser.
- Hvert punkt kan få "Godkend", "Ret" eller "Afvis", og man kan skrive en kommentar.
- En tæller viser "4 af 9 punkter gennemgået".

### Trin 4 – Beplantning (nyt)
- Tabel med art, antal/areal, zone og begrundelse.
- Til højre vises zonerne på kortet.
- Forslag fra systemet står altid som "Forslag", indtil fagbrugeren godkender dem.

### Trin 5 – Rapport og aflevering
- Tjekliste for om rapporten er klar, og hvert punkt linker direkte til det trin, der mangler.
- Forhåndsvisning af rapporten. Eksport til PDF. Afleveringen bliver registreret i revisionssporet.

## 4. Regler for data og ærlighed

- Kun data, der er hentet eller indtastet for sagen, må stå som et resultat.
- Eksempeldata og beregnede antagelser får mærket **"Eksempel"** eller **"Antagelse"** med stiplet kant, og de kommer aldrig med i rapporten.
- Hvis data mangler, står der "Ikke tilgængeligt endnu" eller "—" og et link til det trin, hvor de kan skaffes. Der vises aldrig et 0 eller et fyldtal.
- På sider, der i dag læser fra eksempeldata, bliver tallene erstattet med en tom tilstand og et "Det mangler"-punkt.

## 5. Komponenter

- `SagShell`: topbjælke, trinbjælke, sidepanel og mobil bundbjælke.
- `StepIndicator`: tilstandene ikke startet / i gang / færdig / mangler data.
- `NextActionButton`: én primærknap pr. skærm, som får sin tekst ud fra sagens tilstand.
- `MissingDataPanel`: bygger videre på `MissingDataItem` med årsag, konsekvens og link til trin.
- `DataStatusBadge`: Hentet, Afventer, Mangler, Fejl, Eksempel, Antagelse.
- `SourceCard`, `ReviewItem`, `PlantingTable`, `EmptyState`.
- Genbruger shadcn (Button, Sheet, Dialog, Table, Tabs) og den eksisterende `StatusBadge`.

## 6. Design tokens (i `styles.css`)

Retningen er rolig og professionel og minder om en offentlig myndighed: neutral papirfarvet baggrund, dyb skovgrøn som primærfarve og meget lidt pynt.

```text
--background   oklch(0.985 0.004 100)   papirhvid
--foreground   oklch(0.24 0.02 170)
--primary      oklch(0.42 0.09 165)     skovgrøn
--muted        oklch(0.965 0.006 120)
--border       oklch(0.90 0.01 140)
--status-done        oklch(0.55 0.12 150)
--status-progress    oklch(0.55 0.10 240)
--status-missing     oklch(0.75 0.13 75)  (+ mørk forgrund)
--status-error       oklch(0.55 0.18 28)
--status-example     oklch(0.60 0.02 260) (stiplet kant)
--radius 0.5rem · --shadow-card kun 1px kant + svag skygge
Typografi: "Source Sans 3" (brødtekst) + "Source Serif 4" (sagsoverskrifter)
Skala: 13 / 15 (brødtekst) / 18 / 22 / 28 · linjehøjde 1.5
Afstande: 4-trins grid (8, 12, 16, 24, 32)
```
De faste farver (`text-white` m.fl.) bliver erstattet med `*-foreground`-tokens. Al tekst opfylder WCAG AA, og fokusringe er altid synlige.

## 7. Dansk microcopy

- Trinnavne: Billeder · Datagrundlag · Gennemgang · Beplantning · Rapport og aflevering
- Næste handling (eksempler): "Upload billeder" · "Tegn projektområdet" · "Hent data for området" · "Gennemgå 5 punkter" · "Tilføj beplantning" · "Forhåndsvis rapport" · "Aflever sagen"
- Mangler: "Der mangler et projektområde. Uden området kan vi ikke hente data." [Tegn område]
- Eksempelmærke: "Eksempel – ikke målt for denne sag"
- Antagelse: "Antagelse – skal bekræftes af fagperson"
- Kilde fejlet: "Vi kunne ikke hente data fra Miljøportalen. Prøv igen, eller fortsæt uden." [Prøv igen]
- Aflevering: "Sagen er afleveret 22. okt. 2026 af Jesper. Ændringer herefter registreres i revisionssporet."
- Bekræftelse: "Er du sikker? Sagen kan ikke redigeres efter aflevering uden at genåbne den."

## 8. Brand

- "Freyra" bliver det eneste navn i sidemenu, login, sidetitler og rapporter. "GoFreyra" udgår, og engelske modulnavne bliver oversat.
- Undertekst: "Naturdokumentation for kommuner".

## 9. Rækkefølge for byggeriet

1. Tokens, skrifttyper og brandnavn, samt oprydning i de faste farver.
2. Ny sidemenu og skjulte moduler (styres via Indstillinger → Moduler).
3. `SagShell`, sagsoversigt og videresendelser fra de gamle adresser.
4. Trin 1–3 og 5 kobles på de eksisterende funktioner.
5. Trin 4 Beplantning (ny tabel `plantings` med samme medlemsadgang som de andre sagstabeller).
6. Eksempeldata bliver mærket og fjernet fra visningen af resultater, og flowet bliver testet på mobil (390px) og desktop.

## Antagelser, der skal bekræftes

- En "sag" svarer til det nuværende naturprojekt, så der kommer ikke en ny datastruktur.
- Engelske moduler som Funding og LavbundsMRV bliver skjult som standard, men ikke slettet.
- Den foreslåede skrifttype og grønne farve kan udskiftes, hvis I har en designmanual.
