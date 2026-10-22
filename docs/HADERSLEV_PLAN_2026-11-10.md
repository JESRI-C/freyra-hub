# Freyra til Haderslev Kommune — levering 27.10.2026

Denne plan erstatter planen med dato 10. november. Filnavnet bevares for eksisterende links. **27. oktober 2026 er selve leverancen, ikke en forpremiere.** De tidligere, daterede tekniske beviser er bevaret i [historikken](HADERSLEV_PLAN_HISTORIK_2026-10-15.md); gamle testtal er ikke godkendelse af denne version.

## Det kommunen skal kunne

Åbn én sag, følg Billeder → Datagrundlag → Gennemgang → Beplantning → Rapport og aflevering, og genåbn egne rapporter med kommunens login efter mødet. Freyra er eneste brand. Ingen credits, sensorer, finansiering eller tokenisering indgår.

Bykær Bæk er den konkrete sag. Flyvningen er 24.08.2026, DJI FC3411. P02, P06, P11, P14, P17 og P20 er kernepunkterne. Kun originaler med metadata anvendes som evidens. Kamerapositioner er ikke et verificeret billedfootprint. Kommunens delstrækninger A–E må ikke opfindes.

## Prioriteret udførelse

| Prioritet | Leverance | Accept |
|---|---|---|
| 1 | Ren sag og seks originaler; gentageligt seed | Samme sag og upload-ID ved genkørsel; SHA-256 matcher efter genlæsning |
| 2 | Manuel billedsammenligning i kommunens forløb | DEMO gemmer runde og fototilknytninger uden AI-kald; manuel sammenligning og eventuelle gemte vurderingers begrænsninger vises. Automatisk AI er ikke frigivet |
| 3 | Offentlige kilder | Hentet/delvist/ikke tilgængelig, tidsgrænse, gemt kildeversion og oprindelig hentedato; Sentinel-billede når tilgængeligt |
| 4 | Faglig gennemgang | Foto og offentligt grundlag sammen; bekræftelse/afvisning med begrundelse gemmes uændret i revisionssporet |
| 5 | Beplantningsskitse | 10/20 m, §3/skov fratrukket, lavbund markeret, markblok-kandidater; ingen opdigtede arealer eller lokale effekter |
| 6 | Rapport og adgang | Én knap til dansk PDF/ZIP med hashes fra generator v3; historiske v1/v2-rapporter genåbnes uændret; kommunal læser afgrænset med RLS og faktisk loginprøve |
| 7 | Drift og brugerrejse | Grønne kode-/DB-kontroller, gennemført browserforløb, backup/genopretning og fejlmonitorering |

## Beslutningspunkter

- **22.–25. oktober:** implementering, seks originale kernepunkter, nye kildeadaptere og samlet browserprøve. Den konkrete kilde- og feltvurdering er særskilt fra kodetests.
- **26. oktober kl. 12 dansk tid:** fastfrys leverancen. Ustabile valg skjules i `DEMO_MODE` og beskrives i roadmap. Fejl, datamangler og manglende faglig godkendelse må ikke skjules.
- **26. oktober efter kl. 12:** gennemspil manuskriptet, kontrollér download og kommunens læselogin, gem den godkendte pakke lokalt, og registrér valgt version og kontrolsummer. Kun blokerende fejlrettelser med genprøve.
- **27. oktober:** aflever Freyra og den konkrete Bykær-sag. Gennemfør kommunens loginprøve. Aftal ejer af drift, faglig gennemgang og eventuelle åbne datamangler.

## Anbefaling om miljø

**Brug staging til denne leverance, betinget af go/no-go-listen i [mødemanuskriptet](HADERSLEV_DEMO_2710.md). Produktion forbliver NO-GO, og der merges ikke til main.** Staging skal ved aflevering have aftalt fortsat drift, backup, adgang og ansvar; det må ikke efterfølgende slettes som en engangsdemo.

Manglende RLS-accept, backup/genopretningsbevis, fungerende kommunelogin eller genhentelig rapportpakke er NO-GO for selvbetjening. En lokal rapport kan bruges i gennemgangen ved netværksudfald, men erstatter ikke kravet om kommunens efterfølgende adgang.

## Roadmap efter leverancen

Automatisk billedvurdering afventer dokumenteret billedkvalitet og stabile svar. [Seks-fotoprøven](HADERSLEV_KONTROL_2026-10-22.md) gav fire gyldige kvalitetsafvisninger og to ugyldige svar, altså ingen brugbare AI-observationer. AI-start og genforsøg er derfor skjult i `DEMO_MODE`; gemte resultater, datamangler og manuel faglig gennemgang bevares. Skema, begrænset syntaksreparation, ét genforsøg og fallback til et gyldigt resultat for præcis samme evidens bevares uden for DEMO. Den nye kommunale afgrænsning og rapportgenerator v3 kræver en samlet prøve på den valgte release.

NDVI-pixelanalyse, målte lokale effekter, før/efter-serier, sensorer, automatisk arts- og plejeplan og generel produktionslancering er uden for leverancen. Arealer pr. A–E afventer godkendte delstrækningsgeometrier. Ukendte hektartotaler er accepteret indtil senere faglig afgrænsning og er ikke i sig selv en leveranceblokering. Manglende kildelag og manglende ortofotopixels forbliver synlige datamangler, til de er verificeret.
