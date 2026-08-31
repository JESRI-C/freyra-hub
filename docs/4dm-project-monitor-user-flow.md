# 4DM Project Monitor — bindende brugerflow

Status: P0-målflow, opdateret 2026-08-31. Trin med `AFVENTER` må ikke præsenteres som færdige.

## Primær persona og resultat

En projektleder/fagmedarbejder skal kunne dokumentere konsekvensen af grødeskæring på en bestemt vandløbsstrækning. Resultatet er ikke blot billeder på et kort, men en sporbar kæde fra projektområde og baseline til ændring, faglig vurdering, handling og versionsfast rapport.

## Ende-til-ende-rejse

### 1. Login og projekt

1. Brugeren logger ind og vælger korrekt organisation.
2. Brugeren opretter eller åbner “Haderslev Vandløb Før/Efter”.
3. Projekttype, lokalitet, ansvarlige, periode og formål bekræftes.
4. Systemet viser næste obligatoriske checkpoint frem for et tomt dashboard.

**Stopregel:** Ingen seed-/previewprojekt må ligne live kundedata.

### 2. Projektområde

1. Brugeren søger adresse/sted og zoomer til resultatet.
2. Brugeren tegner, importerer eller vælger boundary.
3. Systemet validerer geometri, WGS84/CRS-antagelse, areal og kilde i en draft.
4. Brugeren vælger eksplicit Gem eller Annuller.
5. Reload og canonical boundary-GeoJSON skal returnere geometrisk samme boundary.

**Aktuel første slice:** sikker Polygon edit/save og canonical boundary-GeoJSON er implementeret lokalt, inklusive validerede huller og hul-korrigeret areal/centroid. Database-reload/browseraccept er `AFVENTER`; MultiPolygon og immutable revisioner følger først, når hele kontrakten understøtter dem.

### 3. Baselineplan

1. Brugeren opretter en “Før”-runde med forventet flyvning/feltbesøg, dato, metode og ansvarlig.
2. Vandløbsstrækning og ønsket fotodækning vises på kortet.
3. Systemet viser krav til GPS, tid, retning, overlap, GSD og eventuelle kontrolpunkter uden at love fotogrammetrisk nøjagtighed fra EXIF alene.

### 4. Før-data

1. Originale dronefotos og feltdata uploades gennem valideringskøen.
2. Hash, rå metadata, GPS/tid/kamera/RTK og QA bevares.
3. Manglende/modstridende data blokerer automatisk kortaktivering og sendes til manuel review.
4. Godkendte assets knyttes til flyvning, survey round, projektfase og tidslinje.
5. Eventuelt færdigt ortofoto/COG registreres som afledt asset med parent, metode og checksum.

### 5. Intervention

1. Grødeskæring registreres som faktisk intervention med strækning, start/slut, udfører, metode og dokumentation.
2. Opgaver, ansvarlige, deadline og evidenskrav knyttes til interventionen.

### 6. Efter-data

Samme kontrollerede flow gentages som “Efter”-runde. Systemet må ikke automatisk parre eller aktivere tvivlsomme billeder uden synlig confidence og mulighed for faglig korrektion.

### 7. Før/Efter og måling

1. Brugeren vælger eksplicit baseline- og efter-dataset/round.
2. Dato, datakilde, metode, status og kvalitet vises ved begge sider.
3. Swipe, side-by-side og skift vises med synkroniseret kortudsnit, projektgrænse og relevante change polygons.
4. Målinger gemmes med geometri, enhed, inputversioner, metode, usikkerhed og actor.

### 8. Faglig review

1. Reviewer claimer elementet og ser originale input samt afledt resultat.
2. Reviewer kan godkende, afvise eller sende tilbage med kommentar.
3. Beslutningen tidsstemples og er immutable; en ny vurdering bliver en ny revision.

### 9. Handling og opfølgning

En godkendt change event kan omsættes til `action` med ansvarlig, deadline, status, observation/intervention-reference og påkrævet evidens. Lukning blokeres, hvis obligatorisk evidens mangler.

### 10. Rapport

1. Brugeren vælger godkendte inputs og previewer mangler.
2. Systemet låser et manifest med boundary, rounds, assets, kilder, metoder, målinger, review og audit.
3. PDF genereres og inspiceres visuelt.
4. Godkendelse låser output/hash; ny generering skaber en ny version.

Den faglige kontrakt for RGB-dronefotos, georefereringsniveauer, gentagelige surveys, felt-ground-truth og kausal forsigtighed er beskrevet i [Vandløb Før/Efter-metoden](./4dm-watercourse-monitoring-method.md).

## Rolleprincip

| Rolle                  | P0-adfærd                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- |
| Viewer/external        | Læse eksplicit delte projektdata; ingen mutation eller godkendelse.                    |
| Field                  | Oprette egne feltkladder/uploads i tildelt projekt; ikke aktivere eller godkende.      |
| Editor/project manager | Redigere projektdata, oprette rounds/interventioner/handlinger og indsende til review. |
| Reviewer               | Faglig beslutning på tildelte elementer; ingen ændring af originalinput.               |
| Org admin/owner        | Medlemmer, roller, kilder og releasegodkendelse inden for organisationen.              |

Effektiv live rolle-/RLS-adfærd er **AFVENTER** to-tenant-verifikation.

## Tomme, fejl- og offline-tilstande

- Hvert trin viser, hvad der mangler, hvem der kan løse det og en konkret næste handling.
- Upstream-, parse-, auth- og Storage-fejl vises som fejl; de erstattes ikke af preview-success.
- Offline feltdata gemmes senere som tydeligt usynkroniseret draft med verificeret lokal tid/position/accuracy; ingen syntetiske koordinater.
- Knapper uden persistence skjules eller deaktiveres med forklaring.
