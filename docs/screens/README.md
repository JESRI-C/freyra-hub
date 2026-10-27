# Skærmbilleder fra produktgennemgang 22.10.2026

Disse billeder viser den eksisterende Haderslev-staging, ikke det lokale redesign. De er taget med en teknisk testkonto på den eksisterende Bykær-sag ved 1440 x 1000 pixels. Der er ikke ændret sagsdata. Billeder og headerområder er maskeret; de ensfarvede felter er bevidste masker, ikke fejl i produktet. Testorganisationens syntetiske navn er ikke en kommunal brugeridentitet.

| Billede | Hvad det dokumenterer |
|---|---|
| [Uden valgt undersøgelse](audit-staging-uden-valgt-undersoegelse.png) | Gennemgang viser en vejledning om at vælge undersøgelse, selv om sagen har seks kontrollerede originaler og kildeversion v2. Næste-knappen går til beplantning. Fund F02. |
| [Valgt undersøgelse](audit-staging-verificering.png) | De seks fotopunkter kan åbnes, når undersøgelsen er valgt. De sammenklappede rækker er ikke manglende programmering. Nederste række fortsætter ved rulning. |
| [Eksisterende rapport](audit-staging-rapport.png) | Nederste del af rapportvisningen: datamangler, PDF/ZIP-knapper, hash og eksplicit kladdemarkering. |

[Sanitiseret kontrolkvittering](audit-staging-2026-10-22.json) registrerer kontroltid, seks viste fotopunkter, blokeret prototypeadgang, nul observerede browserfejl og kontrolsummen på den faktisk genhentede PDF. Rapportfil, private originaler, signed URLs, legitimationsoplysninger og private tekstudtræk er ikke lagt i Git.

## Nyt design, godkendt midlertidig testsession

De følgende 13 billeder viser den nye UI-version på den eksisterende Bykær-sag med læseadgang. De er taget gennem localhost:8788 i den midlertidige Cloudflare-testsession, som Jesper godkendte; de viser ikke en publiceret version. Desktop er 1440 × 1000 og mobil 375 × 812. Kontooplysninger, private originaler og kortgeometri er maskeret. Grå felter er masker, ikke manglende UI. Siden kan være rullet til det relevante indhold.

| Skærm | Billede |
|---|---|
| Login | [Desktop](01-login-desktop.png) |
| Fem startvalg | [Desktop](02-startside-desktop.png) · [Mobil](11-startside-mobil.png) |
| Billeder og genoptagelse | [Desktop](03-billeder-desktop.png) |
| Datagrundlag | [Desktop](04-datagrundlag-desktop.png) |
| Verificering | [Desktop](05-verificering-desktop.png) |
| Baseline | [Desktop](06-baseline-desktop.png) |
| Beplantning | [Desktop](07-beplantning-desktop.png) |
| Rapportkladde | [Desktop](08-rapport-desktop.png) |
| Avancerede indstillinger og nulstilling | [Desktop](09-avancerede-indstillinger.png) |
| Kilder | [Desktop](10-kilder-desktop.png) |
| Seks trin og næste handling | [Mobil](12-sagsforloeb-mobil.png) |
| Genoptagelse efter ugyldigt undersøgelseslink | [Desktop](13-ugyldigt-undersoegelseslink.png) |

Se [redesignets go/no-go](../REDESIGN_GO_NO_GO.md) og [testkvitteringen](redesign-qa-2026-10-22.json) for bestået navigation, filintegritet, oprettelse og originalupload til PDF/ZIP. Skærmbilleder og tekniske tests dokumenterer ikke faglig godkendelse, kommunal brugeraccept eller produktionsdrift.
