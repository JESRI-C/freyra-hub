# Freyra: simuleret sagsbehandlerkontrol

Udført i en rigtig Microsoft Edge-browser på den hostede staging-app, 28.10.2026. Dette er en AI-styret afprøvning af sagsbehandlerarbejdet, ikke en kommunal brugeraccept eller faglig godkendelse.

## Gemt materiale

- 01-vandloeb-og-beplantning: gemt version 4, kladde, 11 udfyldte afsnit. Rapport-id 26433a55-1ea9-45cd-befa-6ee1038fac26.
- 02-byggeri-og-naturbaseline: gemt version 2, kladde, 11 udfyldte afsnit. Rapport-id 0c521a25-9e10-40bb-9993-6267425aaaa6.
- 03-naturbaseline: gemt version 2, kladde, 11 udfyldte afsnit. Rapport-id 8f301d5e-1208-4e88-a025-970b25f0084a.
- 04-aarsstatus-og-pleje: gemt version 2, kladde, 11 udfyldte afsnit. Rapport-id bd94c0da-e274-4bbb-b1ec-766da49c1242.
- 05-fotoatlas-274-registreringer: gemt version 2, kladde, 8 udfyldte afsnit. Rapport-id 930a4c4d-a29c-473f-93f1-c212f6fb805c.

Fire faglige skabeloner har hver 11 udfyldte afsnit og to citerede kildedokumenter. Fotoatlasrapporten har otte afsnit, 74 sider, 274 billedillustrationer og ét kort. Alle faglige godkendelsesmarkeringer er falske. Manglende målinger, projektgrænser, udførelseslog, plantetal og artskontrol beskrives som mangler; ingen værdier er opfundet. Byggerapporten er en konkret mangelliste, da referencecasen ikke dokumenterer et byggeprojekt.

## Arbejde i systemet

- Aktuel Drive-baseline hentet og sammenholdt med den tidligere importerede udgave: samme 274 registreringer og tre tilføjede adgangsnotater, ved DRN-055, DRN-201 og DRN-209. Notaterne er overført med kilde, status og forbehold til de eksisterende billeders adgangsfelter, gemt og genåbnet. Ingen feltbekræftelse eller udført indsats er registreret.
- Fire forskellige rapporter er udfyldt, kildehenvist, gemt, redigeret som nye versioner og genåbnet. Tidligere versioners indhold blev kontrolleret uændret.
- Kundegodkendelse er blokeret i browseren for alle fire faglige skabeloner, fordi faglig gennemgang og verificeret originalgrundlag mangler.
- Alle fem dokumenter er genfundet via bibliotekets rapport-id og genåbnet med deres korrekte titler. De ligger i den isolerede tekniske testsag, ikke i kommunens driftssag. Links til testsagen kræver den eksisterende adgang. Rapportfilerne kan åbnes direkte fra filpakken.
- Fire PDF'er og fire DOCX-filer er eksporteret via appens knapper. Atlasrapporten er også eksporteret som PDF, og fotoatlas/baseline som selvstændig HTML og JSON. HTML-atlasset er åbnet uden netforbindelse, søgt på DRN-055, og den nyeste kildenote er genfundet.

## Fund og rettelse

**Rettet:** Indlæsning af kilderegisteret kunne overskrive tekst, skrevet mens svaret var undervejs. Rettet i cfe09c4e0cbb3fac4379460dc353f9b9fea17fc1 med bevarelse af det aktuelle udkast. En ny regressionstest og en rigtig browserkontrol med bevidst forsinket kildesvar bekræfter rettelsen. Vandløbsrapportens ufuldstændige første forsøg, v1 og v2, er bevaret i revisionssporet; v3 og v4 indeholder alle afsnit, og kun v4 er i leverancen.

**Åbent brugervenlighedsfund:** Rapportbiblioteket viser oprettelsesdato og tekniske rapport-id'er, men ingen titler eller rapporttyper. Dokumenterne kan åbnes og indeholder korrekte titler. Navnevisningen bør forbedres før kommunal overdragelse. UI viser også det engelske feltord Scope og tekniske kilde-id'er.

## Kontrol af filer

- Alle 12 sider i de fire korte PDF'er er renderet og visuelt gennemgået. Ingen klippet tekst, overlap eller ulæselige tegn fundet.
- Atlas: alle 74 sider er læst teknisk; 274 billeder og ét kort er faktisk tegnet i PDF'en. Sider 1, 2, 3, 5, 19, 56, 58 og 74 er renderet; kontaktarket og forstørrede sider 2, 5 og 19 er visuelt gennemgået. De øvrige atlassider er ikke individuelt visuelt kontrolleret.
- DOCX-filerne er kontrolleret som gyldige ZIP/XML-filer med korrekt titel og alle skabelonafsnit. Visning i Microsoft Word: **ikke verificeret**.
- Fuld testsuite efter rettelsen: **2.919 bestået, 199 testfiler**. Første parallelle kørsel havde to tidsudløb; begge bestod ved isoleret genkørsel, og den efterfølgende fulde kørsel med to workers var grøn. Typecheck og staging-build bestod. Ændrede filer har ingen lintfejl og én eksisterende fast-refresh-advarsel.

## Miljø og afgrænsning

Staging: https://gofreyra-p0-staging.gofreyra-jesri-staging.workers.dev
Kildecommit: cfe09c4e0cbb3fac4379460dc353f9b9fea17fc1
Worker-version: 203a9441-9578-4187-ac26-c30b1010d184
Supabase: xdvqdzdpyceojbdknofi

Ingen beregningsmotorer, migrationer, kundebrugere, produktionsdata eller main er ændret i denne kontrol. Metadatafilens offentlige sourceRevision er tilføjet det færdige staging-build fra samme rene kildecommit før deploy.

Denne afprøvning ændrer ikke produktionens **NO-GO**: SMTP/levering, kundeadresser, navngiven faglig godkender, komplet hostet gendannelse, aktiv fejlalarm og godkendt driftsansvar/rollback mangler fortsat den nødvendige dokumentation i releaseplanen. Belastningsproblemet fra tidligere offentligt dataflow er heller ikke afklaret af denne rapportkontrol.

## Drive-overførsel

Rapportupload er automatisk afvist, fordi kontrollen kræver godkendelse af de private rapporter og den konkrete destination. Jesper er spurgt om upload af hele pakken til mappen 1n4zkAPUa65zgqcNLEeGdxItY-uGeCkyF. Overførslen er ikke udført; filerne er gemt i testappen og lokalt. Den eneste allerede uploadede fil er en offentlig staging-versionkvittering, ingen rapport eller dronefoto.

Drive-mappe: https://drive.google.com/drive/folders/1n4zkAPUa65zgqcNLEeGdxItY-uGeCkyF
