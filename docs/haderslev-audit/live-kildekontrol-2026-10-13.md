# Direkte kontrol af offentlige kildeadaptere

Kontrolleret 13. oktober 2026 fra den lokale Haderslev-checkout. Testområdet `9.0,55.1,9.7,55.4` er et teknisk prøveområde. Det er ikke en godkendt kommunal delstrækning, og ingen database- eller kundedata blev skrevet.

## DMI

Kommando: `node --experimental-strip-types scripts/verify-dmi-source.mjs --bbox 9.0,55.1,9.7,55.4 --from 2026-08-24T06:00:00Z --to 2026-09-07T06:00:00Z`.

Den faktiske adapter `dmi-historical-station-precip/v1` returnerede exit 0, `mode=live`, `status=partial`, ingen kildefejl og 14 officielle døgnværdier fra station `05384`, Vojens Airport. Hentetid: `2026-10-13T10:12:42.632Z`. Alle stations- og værdissider blev gennemgået.

Stationsforbindelsen til projektets opland er `not_assessed`. Den observerede serie går fra `2026-08-25T00:00:00.001000+02:00` til `2026-09-08T00:00:00+02:00`. Døgnintervallerne matcher ikke de ønskede vilkårlige UTC-tidspunkter. Derfor er `summary.complete=false` og `totalMm=null`; der er ikke opfundet en fuld periodesum. De oprindelige værdier, herunder virkelige nuller, er bevaret.

Payload-SHA-256: `50fa97b436f02c3d1c3703f6e0d1adadc583440976b04e6c949c9ce13273b373`.

Primær kilde: [DMI climateData](https://www.dmi.dk/friedata/dokumentation/apis/climate-data-api-1). Stationernes nedbør er kontekst, og den dokumenterer ikke vandføring, opstuvning eller vedligeholdelsesbehov i bækken.

## Sentinel-2

Kommando: `node scripts/verify-sentinel-source.mjs --bbox 9.0,55.1,9.7,55.4 --from 2026-08-24 --to 2026-08-31`.

Den faktiske adapter `sentinel-2-l2a-catalog/v1` returnerede exit 0, `mode=live`, `status=partial`, ingen kildefejl og 10 geografiske scenekandidater. Hentetid: `2026-10-13T10:17:45.112Z`. Katalogpaginationen var komplet for testforespørgslen. Scenedatoerne var 24.–31. august 2026.

Lokal QA for skyer, skygger, nodata og brugbarhed er `pending`; der er ikke hentet billedbånd eller beregnet NDVI. Scene-ID og separat produkt-ID er bevaret: leverandørens produkt-ID-felt var ikke oplyst i disse svar og står derfor `null`. Global skyprocent, eksempelvis 0,59 % for én scene, er ikke projektområdets lokale skyprocent.

Payload-SHA-256: `265eb6c80d8a2109a9f7b1b4e5b30bfddff4650a84ac15895168a133440836c9`.

Primær kilde: [Copernicus Data Space STAC](https://documentation.dataspace.copernicus.eu/APIs/STAC.html). Det aktuelle endpoint er `https://stac.dataspace.copernicus.eu/v1/search`.

## Acceptgrænse

Kaldkontrollen beviser de to adapteres faktiske læsning og konservative status på testregionen. Den beviser ikke gemt baseline, Worker-runtime, lokal rasterkvalitet, kommunal geografi eller faglig pilotgodkendelse. Disse har separate opgaver og acceptkrav.
