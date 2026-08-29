# GoFreyra arkitektur

Senest verificeret: 2026-08-29 med baseline HEAD `03dca07` på `codex/gofreyra-p0`.

## Faktisk teknisk udgangspunkt

- TanStack Start/Router, React 19 og TypeScript.
- Vite med Lovable-konfiguration, Nitro og Cloudflare build-adapter.
- Tailwind/shadcn-baseret UI og TanStack Query.
- Leaflet med Leaflet-Geoman til kort, geometrier og WMS-overlays.
- Supabase Auth, PostgreSQL/PostGIS og Storage; SQL-historik ligger i `supabase/migrations/`.
- Vitest til eksisterende unit-/servicetests. Der er ikke verificeret Playwright- eller RLS-testharness.

Repositoryet er **ikke** Next.js. Stackskift er ikke en P0-opgave.

## Runtime og dataflow

```text
React/TanStack UI
  -> TanStack server functions og server routes
     -> brugerbundet Supabase-klient -> Auth + RLS -> Postgres/Storage
     -> snævert privilegeret job/ingest -> service role -> Postgres/Storage
     -> kildeadaptere -> officielle REST/WMS/WFS/STAC-kilder
  <- status, versionsreferencer, fejl og proveniens
```

Browseren bruger en publishable Supabase-nøgle og brugerens session. `service_role` omgår RLS og må kun anvendes efter server-side autentifikation, autorisation og afgrænsning. Observations- og monitoring-ruterne kræver nu hver sin uafhængige server-secret; projektscope og natur-serverfunktionen udestår i `SEC-P0-01B`.

Der findes fortsat to browser-Supabase-klientlag. Browser-smoke reproducerer GoTrue-advarslen om flere klienter under samme storage key; `AUTH-P0-01` skal konsolidere sessionejerskabet.

## System of record

Supabase skal være system of record for tenant, projektmetadata, geometri, aktiver/datasæt, status, provenance, godkendelser, audit og Storage-referencer. Store binære filer ligger i objektstorage; Git indeholder kode, migrationer, små syntetiske fixtures og dokumentation.

Det nuværende schema har blandt andet organisationer, projekter, medlemskaber, sites, observationer, indikatorer/målinger, dokumenter/rapporter, audit, geodata og projektmedier. P0-semantik for versionsfaste projektgrænser, survey rounds, fotopar og rapportversioner er ikke komplet verificeret. Live schema/migrationsstatus er **AFVENTER**, fordi den konfigurerede Supabase-instans ikke var tilgængelig gennem connectoren.

Seed-fallback gør dele af UI'et startbart uden Supabase. Det er udviklingshjælp, ikke bevis for auth, persistence, tenancy eller en kundeleverance.

## P0-domæneflow

```text
kilde + kildeversion
  -> projekt + versioneret projektgrænse
  -> Før/Efter-registreringsrunde
  -> aktiv/datasæt + version + checksum
  -> analyse/måling + metodeversion + usikkerhed
  -> menneskelig validering/godkendelse
  -> rapport-snapshot + rapportversion + manifest
```

Nye tabeller må kun tilføjes efter sammenligning med eksisterende schema, så parallelle domænemodeller undgås.

## Geodata

- Leaflet er den eksisterende kortmotor og bevares til P0.
- Offentlige kilder skal ligge bag adaptere/kildekatalog med timeout, status og provenance.
- WMS anvendes primært til visning; WFS/REST/download kun til analyse, når vilkår og volumen tillader det.
- Tung GeoTIFF/COG-, tile-, punktsky- og fotogrammetribehandling hører til i en særskilt job/worker-model. En sådan produktionsklar worker er **AFVENTER** og er ikke nødvendig for at kunne indlæse færdige P0-leverancer.

## Rapportering

Der findes klientbaseret PDF-generering med `jsPDF` og metadata i `documents`, men audit har ikke verificeret et immutable snapshot, versionsfast filaktiv, komplet datamanifest eller reproduktion. P0-målet er, at godkendte rapporter aldrig ændres; ny generering skaber en ny version.

## Miljøer og secrets

- Lokal runtime: Node `>=22 <23`; verificeret auditmiljø var Node 22.14/npm 10.9.
- Supabase `project_id` i repoet er `ikrmcetjutqcjtwfhzfv`; miljøets identitet og rolle som dev/test/prod er **AFVENTER**.
- Dev/test/prod-adskillelse, Storage-buckets og deploypipeline er **AFVENTER** live verifikation.
- Lokale værdier må kun ligge i ignorerede env-filer eller platformens secret store. Kun nøglenavne må dokumenteres eller versionsstyres.
- Privilegerede ingest/cron-ruter bruger `OBSERVATIONS_INGEST_API_SECRET` og `MONITORING_CRON_API_SECRET`; de må ikke genbruge nogen Supabase API-nøgle.

## Sikkerhedsinvarianter

1. Hver tenantbåret læsning og skrivning skal have både RLS og server-side kontrol, hvor handlingen er kritisk.
2. Ingen klientkendt publishable/anon-nøgle må fungere som hemmelighed for privilegerede endpoints.
3. Ingen bruger må kunne oprette sig selv som admin eller vælge en anden tenant gennem input.
4. Preview/mock må mærkes tydeligt og må aldrig registreres som live evidens.
5. Audit og godkendte rapportversioner må ikke kunne opdateres eller slettes gennem almindelige brugerflows.
