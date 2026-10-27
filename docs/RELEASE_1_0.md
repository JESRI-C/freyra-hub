# Freyra release 1.0

Arbejdende releasekontrol. **NO-GO for kommunal ibrugtagning 27.10.2026 og NO-GO for produktion**, indtil beviserne nedenfor er afsluttet. Ingen merge til main, produktionsmigration eller produktionsudgivelse er udført.

Fallback er uændret: `625781906a4f49d120b6b3581261279dd889e6de`. Arbejdet ligger på `codex/release-1.0`, oprettet direkte fra fallback. PR 18 er integreret med særskilt rettelse af læserollens adgang.

| Punkt                          | Status           | Bevis / åbent                                                                                                                                                              |
| ------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a Demodata og UI               | IKKE VERIFICERET | Eksempelsamlinger flyttet til testfixtures; rigtige datakomponenter genbruges. Browserprøve udestår.                                                                       |
| b RLS og idempotens            | IKKE VERIFICERET | 79 isolerede PostgreSQL-kontroller består. Stagingrettelse lagt ind. Virkelig viewer/API- og browserprøve udestår.                                                         |
| c Kommunalt login og SMTP      | FEJL             | Testlæser provisioneret med det eksisterende script. Egen SMTP er slået fra i staging; se docs/screens/release-1.0/smtp-staging.png. Produktions-SMTP er ikke verificeret. |
| d Samlet browserflow           | IKKE VERIFICERET | Originalfotoets kilde er fundet. Ny releaseprøve og skærmbilleder udestår.                                                                                                 |
| e Bygning og tests             | IKKE VERIFICERET | Endelig ren CI-kørsel udestår. Lokal fuld kørsel stoppet efter ressourcebetinget timeout.                                                                                  |
| f Backup og gendannelse        | IKKE VERIFICERET | Fuld hostet database, Auth og originale storage-objekter skal gendannes til isoleret mål.                                                                                  |
| g Fejlalarm                    | IKKE VERIFICERET | Døgnaktiv kontrol, modtager og faktisk leveret alarm skal dokumenteres.                                                                                                    |
| h Alle roller/tabeller/buckets | IKKE VERIFICERET | Kataloggennemgang og virkelige rolletests samles her.                                                                                                                      |
| i Rollback                     | IKKE VERIFICERET | Præcise trin og versions-/datakompatibilitet skal dokumenteres.                                                                                                            |
| j Driftsansvar                 | FEJL             | Teknisk vagt og ansvarlig fagperson er endnu ikke udpeget af Jesper.                                                                                                       |

## Hvad der er rettet

- `dae6afa`: nye evidenstabeller og originale migrationsfiler er gjort gentagelige; 79 lokale RLS-kontroller inklusive afviste læserskrivninger.
- `6547c57`: PR 18 integreret oven på den uændrede fallback. Staging-migrationshistorik afstemt for release-sikkerhedsrettelsen.

## Go-live-plan til Jespers godkendelse

1. Luk alle P0-fejl og dokumentér hele browserforløbet mod staging på den præcise releaseversion.
2. Udpeg teknisk drift og fagligt ansvar. Konfigurér Freyra SMTP og verificér levering og nulstilling med en godkendt modtager.
3. Konfigurér backup af database, Auth og originale filer; udfør en isoleret gendannelse og godkend RPO/RTO. Afprøv den valgte alarmkanal.
4. Tag verificeret backup og optæl uanvendte migrationer. Gennemgå migrationsrækkefølge og dry-run for det udtrykkeligt valgte produktionsmål.
5. Jesper skriver ja til den konkrete produktionsplan. Først derefter må main/produktionsmigration/deploy udføres. Draft-PR'en merges ikke af agenten.
6. Opret kommunens brugere med de mailadresser, Jesper oplyser. Begræns dem til Haderslev Kommune og den aftalte Bykær Bæk-sag. Test hver rolle i en ren session.
7. Udfør produktionssmoke, godkend den konkrete faglige leverance og overvåg. Ved fejl følges den dokumenterede rollback; ingen destruktiv tilbagerulning af append-only data.

## Åbent for Jesper

Kommunens mailadresser, SMTP-udbyder og Freyra-afsender, alarmmodtager/teknisk vagt, ansvarlig fagperson samt udtrykkeligt ja til en efterfølgende produktionsudgivelse. Nøgler og adgangskoder må ikke skrives i chatten.
