# LavbundsMRV — regulatorisk positionering og evidensgrundlag

Dette dokument samler de verificerede fund fra den dybe research af
lavbundsmodulet (juli 2026), som Etape J bygger på. Alle fund er
adversarielt verificeret (3-0 stemmer) mod primærkilder.

## 1. VLP-hullet: Staten honorerer kun ex-ante

Ordningen **Vådlægning af Landbrugsjord og Privat udtagning (VLP)** krediterer
klimaeffekten **ex-ante** — dvs. på baggrund af forundersøgelsens beregnede
effekt, ikke den målte. Der findes ingen national ordning, der honorerer
eftermåling af lavbundsprojekters faktiske effekt.

- Ansøgningsrunden for VLP 2026 åbner **12. august 2026**.
- Konsekvens: kommuner og lodsejere har i dag intet formelt krav om — og ingen
  betaling for — at dokumentere, at effekten faktisk indtræffer.
- **GoFreyras position:** LavbundsMRV udfylder hullet mellem krediteret og
  målt effekt, så kommunens klimaregnskab hviler på verificerbare tal.

Kilder: lbst.dk (VLP-ordningsbeskrivelse og ansøgningsfrister),
https://lbst.dk/tilskud-selvbetjening/tilskudsguide

## 2. Sørestaurerings-præcedensen: eftermåling kan honoreres

Sørestaureringsordningen indeholder — i modsætning til lavbundsordningerne —
midler til **opfølgende overvågning efter indgreb** (post-monitoring). Det er
et regulatorisk præcedens for, at staten kan finansiere eftermåling, og et
argument for at samme princip indføres på lavbundsområdet.

Kilder: Miljøstyrelsens sørestaureringsordning,
https://mst.dk/natur-vand/vandmiljoe/soeer/soerestaurering

## 3. GEST/proxy-metoder underestimerer systematisk

Empiriske sammenligninger af GEST-baserede (Greenhouse gas Emission Site
Types) ex-ante-opgørelser mod målte fluxe viser, at proxy-metoderne
**underestimerer den faktiske klimaeffekt i ~96–98 % af de undersøgte
scenarier** (bl.a. tyske MoorFutures-projekter).

- Konsekvens for produktet: målt verifikation vil typisk vise en
  opnåelsesgrad ≥ 100 % — den er et *opgraderings*-argument, aldrig et
  nedskrivningsgrundlag. UI'et forklarer dette eksplicit, når opnåelsesgraden
  overstiger 100 % (klima-siden) og i rapportens afsnit "Metodisk kontekst".

Kilder: MoorFutures-metodedokumentation (Ministerium für Landwirtschaft und
Umwelt Mecklenburg-Vorpommern); Couwenberg et al., "Assessing greenhouse gas
emissions from peatlands using vegetation as a proxy", Hydrobiologia 674
(2011); GEST-2.0-kataloget (Greifswald Mire Centre).

## 4. Vandstandsdybde (WTD) er MRV-rygraden

Dybden til vandspejl (Water Table Depth) er den bedst dokumenterede enkelt-
prediktor for drivhusgasflux fra organisk jord:

- IPCC 2013 Wetlands Supplement bygger emissionsfaktorer på dræningsklasser.
- VM0036 (Verra) og GEST bruger WTD-klasser som fallback-proxy, når direkte
  fluxmåling ikke er mulig.
- Satellit-baserede metoder (InSAR, optisk) når kun R² 0,45–0,78 mod
  in-situ-WTD — feltmåling (loggere + pejling) er fortsat nødvendig for
  revisionssikker verifikation.

Modulets design følger dette: HOBO-loggere/manuel pejling er primærdata,
satellit/drone er understøttende kilder, og afvandingsklasserne følger
Naturstyrelsens klasseskala.

Kilder: IPCC 2013 Wetlands Supplement; Verra VM0036; Couwenberg et al. 2011;
DCE teknisk rapport om W01-overvågningsdesign.

## 5. Kulstof2022 er det autoritative lavbundskort

**Kulstof2022** (Aarhus Universitet/Miljøministeriet, publiceret via MiljøGIS)
er det kort over kulstofrig lavbundsjord (6–12 % og >12 % C), som
tilskudsordningerne administreres efter. Modulet viser laget som WMS-overlay
i både geometri-editoren og lavbund-feltkortet (konfigurerbart via
`VITE_KULSTOF2022_WMS_URL` / `VITE_KULSTOF2022_WMS_LAYER`, jf.
`src/data/kulstof2022.ts`).

Kilder: MiljøGIS klimalavbund, https://miljoegis3.mim.dk ; Aarhus Universitet
(Agroøkologi), Kulstof2022-dokumentation.

## 6. Empirisk vandstands-emissionssammenhæng og dansk kritik af ex-ante

- **Evans, C. D. m.fl. (2021):** "Overriding water table control on managed
  peatland greenhouse gas emissions", *Nature* 593, 548–552
  (DOI: 10.1038/s41586-021-03523-1). Vandstanden er den dominerende styring af
  drivhusgasemission fra forvaltet tørvejord — **~3 t CO₂e/ha/år pr. 10 cm
  ændring i vandstandsdybde**. Det er det direkte empiriske grundlag for at
  bruge målt vandstand som verifikationsparameter.
- **Klimarådet, analyse af kulstofrige lavbundsjorder:** rejser tvivl om, at
  standardfaktorerne matcher jordernes faktiske dræningstilstand — dvs. en
  dansk, politiknær anerkendelse af, at ex-ante-antagelser kræver måling.

## 7. Baseline-princippet (før/efter)

Statens N/P-overvågningsprotokoller bygger på før/efter-måling: målinger før
projektets etablering dokumenterer førtilstanden og tæller ikke som opnået
effekt. Modulet implementerer dette via projektets **etableringsdato**
(`splitVedEtablering` i `src/services/lavbundBeregning.ts`): baseline-målinger
udelukkes fra verifikationsgraden, vises skraveret i tidsserien og opgøres
separat i rapportens afsnit "Metode & datagrundlag".
