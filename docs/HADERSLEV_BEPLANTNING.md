# Beplantningsskitse til Haderslev

Kortfanen viser **Skitse – kræver faglig validering** fra den seneste gemte offentlige kildeversion. Kortet bruger 10 og 20 m som alternative afstande fra den officielle vandløbslinje; de må ikke lægges sammen. Afstanden er fra en registerlinje, ikke en opmålt vandløbsbred.

§3-registreringer og eksisterende skov/trædække fratrækkes uden dobbelt arealoptælling. Markblokke efter fradrag er kandidater. Lavbund/kulstofrig jord er betinget og kræver særskilt vurdering af blandt andet hydrologi og natur. Arealer uden for markblokke er uegnede efter denne afgrænsede metode, når markblokdækningen er komplet. Manglende dækning giver betinget/uafklaret status, aldrig et positivt egnethedsresultat.

Geometrien beregnes geodætisk i WGS84 med Turf og klippes til sagens projektpolygon. Kildens hentetid er ikke dens opmålingstid. Registerdata fra 2022/2026 dokumenterer ikke automatisk tilstanden på flyvedagen 24.08.2026. Ugyldig geometri, manglende officiel linje eller utilstrækkeligt kildegrundlag vises som mangler.

## Delstrækninger og arealer

A–E opgøres kun med bekræftede, entydige delstrækningspolygoner og komplet geometrisk dækning af samtlige nødvendige lag. Ellers står ha som **ukendt**, ikke nul. Dronefotoets GPS må ikke bruges som opdigtet delstrækningsgrænse. De nuværende §3-udtræk har ufuldstændig dækningsdokumentation, og skovregisteret omfatter ikke nødvendigvis alle træer. En livevisning kan derfor være en betinget skitse, selv om kilderne svarer.

Beregningskoden har en **læsekontrakt**, som kan fortolke kilden `municipal-reaches`, hvis den allerede findes i en gemt baseline. Kontrakten er `freyra.municipal-reaches/v1`, `crs: EPSG:4326`, `approvedBy`, `approvedAt` og `reaches` med ID A–E og Polygon/MultiPolygon. **Der findes endnu ingen færdig CLI, API eller brugerflade, som sikkert importerer og versionerer dette grundlag.** Den generelle serverfunktion til at gemme baselines er ikke en godkendelses- eller importfunktion, og felterne `approvedBy` og `approvedAt` er ikke i sig selv bevis for en faglig godkendelse.

Konkrete hektartotaler forudsætter både modtagelse af reelle, fagligt godkendte A–E-geometrier med dokumenteret proveniens og en importfunktion med adgangskontrol, geometrivalidering, kontrolsummer og en ny baselineversion. Eksisterende rapporter og undersøgelser skal beholde deres oprindelige kildehenvisninger. Import af A–E alene løser ikke de øvrige dækningshuller: ha forbliver ukendt, indtil de nødvendige natur- og trædækkelag også har dokumenteret komplet geometrisk dækning.

## Litteratur og rapport

Temperatur-, N- og P-intervaller er litteraturresultater med angivet forsøgs-/modelkontekst og primære kildehenvisninger. De er ikke lokale prognoser og multipliceres aldrig med hektar. CO2 står som ikke opgjort, fordi der ikke er valgt et fagligt anvendeligt lokalt interval; kulstoflagre må ikke omfortolkes som årlig nettoeffekt. Kilderne og kontroldatoen findes i `src/services/planting/planting-literature.ts` og fryses i rapporten.

Nye rapporter bruger generator v2 og gemmer skitsens metode, kilder, hentetider, A–E-status, litteratur og præcise faglige fotobeslutninger sammen med rapportens SHA-256. PDF og ZIP indeholder disse afsnit; ZIP har særskilte JSON-filer og kontrolsum pr. fil. Ældre v1-rapporter beholder deres generator og oprindelige indhold. En faglig beslutning om et fotopunkt godkender ikke hele rapporten eller et fysisk indgreb.

Regeltests dækker buffere, fradrag, overlappende natur/skov, polygonhuller, manglende lag, ugyldige koordinater og ukendte delstrækninger. Rapporttests kontrollerer genafspilning af v1/v2, immutable beslutningsreferencer og filkontrolsummer. Databasegrænser er desuden dækket af pgTAP; de skal være grønne i CI før stagingmigrering.
