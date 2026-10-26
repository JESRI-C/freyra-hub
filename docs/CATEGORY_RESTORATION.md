# Rettelse: kategorier skal være tilgængelige

22.10.2026. Brugerens accept af redesign er genåbnet: Opgaven var at rydde op og omarrangere, ikke at gøre fagkategorier utilgængelige.

## Årsag og observeret adfærd

Den kendte online stagingadresse blev kontrolleret med eksisterende læseadgang. Sidemenuen viste kun Sager; Alle kategorier fandtes ikke. Direkte navigation til `/app/impact` endte på `/app/projects`. Kontrollen ændrede ingen sagsdata.

Den begrænsende demopræsentation fandtes i basecommit `6257819`. Første redesign videreførte den både i layoutets omdirigering, fagværktøjskataloget og sagens faner. Det opfyldte ikke brugerens forventning om tilgængelighed. At kildefiler og routes stadig fandtes i Git var utilstrækkeligt som acceptbevis.

## Rettelse i PR #17

- Sager og Kilder forbliver de to primære menupunkter.
- Alle kategorier er en fast, navngiven indgang i sidemenuen, også på mobil.
- Sager viser en åben kategorioversigt med de 14 eksisterende fagværktøjsindgange.
- Stagingens præsentationsflag omdirigerer ikke længere kategorierne til Sager.
- Flere sagsværktøjer giver adgang til alle 14 eksisterende sagsfaner. Det guidede sagsforløb kan åbnes igen med den valgte undersøgelse bevaret.
- Lavbundsprojekternes eksisterende faner og kobling til kernesagen er tilgængelige igen.
- Kilder linker til den fulde eksisterende kildeoversigt.

| Kategori | Eksisterende adresse |
|---|---|
| Samlet overblik | `/app/overview` |
| Rapporter | `/app/reports` |
| Kort og zoner | `/app/connect/map` |
| Byggeri og natur | `/app/construction` |
| Overvågning og feltdata | `/app/connect` |
| Kort og beplantning | `/app/lavbund` |
| Projektindsigt | `/app/decisions` |
| Dokumentation og audit | `/app/ledger` |
| Data og metoder | `/app/connect/registry` |
| Finansiering og effekt | `/app/impact` |
| Offentlig effekt | `/app/public-impact` |
| Indstillinger | `/app/settings` |
| Brugere og roller | `/app/settings/users` |
| Systemtest | `/app/system-test` |

Naturprojekter findes fortsat under Sager. Kategoriernes eksisterende funktioner, herunder kendte ufærdige dele, er ikke omskrevet eller erklæret færdige. Automatisk AI, offline eksempeldata, beregninger, serviceadgang, database og RLS ændres ikke. Login og organisationsvalg er fortsat påkrævet.

## Accept

Den nye browserprøve kontrollerer en uafhængig liste over alle 14 adresser, synlige kategorilinks og alle sagsfaner. Det er en strengere bevaringskontrol end kun at kontrollere, at routefilerne findes. De eksisterende prøver for læserrettigheder, originalupload, rapportkontrolsum og nul AI-kald bevares.

**NO-GO — arbejdet standset efter brugerens regel om brud på demo-flowet.**

Typekontrol, lint (0 fejl, 23 eksisterende advarsler), 2.790 tests og staging-build bestod. Bevaringskontrollen fandt 80 oprindelige feltbindinger/handlers bevaret i de nu berørte skærme. Browserprøven fandt derimod:

1. `/app/construction` giver HTTP 500 ved direkte åbning i den midlertidige testsession. Den viste globale fejlside mangler kategorinavigationen. Årsagen er endnu ikke endeligt verificeret; route-loaderen læser data før browserens gemte login er tilgængeligt på serveren, hvilket er en mulig forklaring. Ingen service-, database- eller adgangsændring er foretaget.
2. Valg af organisation åbner `/app/overview` (to eksisterende navigationer i `src/routes/select.tsx`) og viser “Hvad skal du arbejde med?”. Fjernelse af demoens omdirigering afslørede denne afhængighed. Demoens forventede startside “Hvad vil du gøre?” bliver derfor ikke åbnet. Dette er en regression i det guidede flow.
3. Den eksisterende rapport blev stadig genhentet med præcis forventet SHA-256 og seks fotos; prøven bestod på 29,0 sekunder.

Browserresultat: 2 fejlede prøver, 1 bestået. De resterende kategorier, sagsfaner og mobilvisningen er ikke erklæret bestået. Ingen nye kategori-skærmbilleder er frigivet som godkendt dokumentation.

Ændringerne gemmes som ufærdigt arbejde på redesign-grenen, og PR #17 forbliver draft. Den midlertidige testsession er lukket. Online staging, main og Haderslev-demogrenen er ikke ændret. Før frigivelse skal organisationsvalgets destination rettes, byggeprojektets direkte åbning undersøges og hele browserprøven bestå.
