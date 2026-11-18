# Monitoring & Field Data — Datamodel

## Fase A (leveret i databasen)

### monitoring_devices

Fysisk enhed placeret i marken.

| Kolonne | Type | Note |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid → organizations | |
| project_id | uuid → projects | ON DELETE CASCADE |
| zone_id | uuid → monitoring_zones | nullable, ON DELETE SET NULL |
| name | text | fx "SoilSense-02" |
| device_type | text | soil_moisture / gateway / camera / weather_station / drone / ... |
| manufacturer, model, serial_number | text | |
| external_device_id | text | provider-side ID |
| status | text | not_activated / online / delayed / offline / error / maintenance / archived |
| connectivity_type | text | lorawan / nb_iot / lte / wifi / bluetooth / manual / api |
| firmware_version | text | |
| battery_level | int | 0–100 |
| signal_strength | int | 0–100 |
| expected_interval_minutes | int | forventet målefrekvens |
| last_seen_at | timestamptz | |
| last_measurement_at | timestamptz | |
| latitude, longitude | double | |
| geometry | jsonb | GeoJSON Point/Polygon |
| configuration | jsonb | provider-specifik |
| created_by | uuid → auth.users | |

RLS: kun projektmedlemmer.

### device_parameters

Hvad en enhed måler.

| Kolonne | Type | Note |
|---|---|---|
| device_id | uuid → monitoring_devices | ON DELETE CASCADE |
| parameter_key | text | unik pr. device_id |
| parameter_name | text | |
| unit | text | |
| min_value, max_value | double | valideringsgrænser |
| expected_interval_minutes | int | overrider device-niveau |
| validation_rules | jsonb | |
| is_active | boolean | |

### device_measurements

Rå målinger.

| Kolonne | Type | Note |
|---|---|---|
| device_id | uuid → monitoring_devices | |
| parameter_id | uuid → device_parameters | nullable |
| measured_at | timestamptz | fra enheden |
| received_at | timestamptz | på platformen |
| value | double | |
| unit | text | |
| quality_status | text | unvalidated / valid / suspect / invalid |
| quality_score | numeric(5,2) | 0–100 |
| validation_flags | jsonb | array af regler der udløste flag |
| source_payload | jsonb | rå payload for lineage |
| latitude, longitude | double | valgfrit hvis mobil enhed |

Indeks: `(device_id, measured_at DESC)`, `(parameter_id, measured_at DESC)`, `(device_id, quality_status)`.

### device_maintenance_logs

| Kolonne | Type | Note |
|---|---|---|
| device_id | uuid → monitoring_devices | |
| maintenance_type | text | service / calibration / battery_swap / relocation / repair / other |
| performed_at | timestamptz | |
| performed_by | uuid → auth.users | |
| result | text | passed / failed / needs_followup |
| next_due_at | timestamptz | næste planlagte service |
| notes | text | |

### monitoring_zones

Geografiske underområder af et projekt.

| Kolonne | Type | Note |
|---|---|---|
| project_id | uuid → projects | |
| name | text | |
| zone_type | text | wetland / meadow / forest / watercourse / buffer / pilot / reference / monitoring / sensor / drone / restoration / risk / other |
| description | text | |
| status | text | active / inactive / archived |
| color | text | UI-farve |
| geometry | jsonb | GeoJSON Polygon/MultiPolygon |
| area_m2, area_hectares | double | |
| centroid_lat, centroid_lng | double | |
| source_type | text | manual / cadastre / field_block / imported |
| source_metadata | jsonb | |
| tags | text[] | |

## Fase B (planlagt)

- `data_sources` — kilde-metadata + `quality_score`.
- `integration_runs` — hver synkronisering med `records_received/processed/failed`, `response_time_ms`, `error_message`.
- `field_observations` — arts- og feltregistreringer med `visibility` (præcis / maskeret / kun zone / skjult).
- `observation_media` — junction til `project_media`.
- `data_quality_assessments` — beregnede scores pr. datasource/device med `explanation` (klartekst).

## Fase C (planlagt)

- `integration_connections` — `encrypted_credentials_reference` peger til Supabase Vault, aldrig plaintext.
- `drone_flights`, `drone_assets`.
- `environmental_analyses` — NDVI, vandrisiko, vegetation, biodiversitet.
- `data_exports` — audit-spor for hver eksport.
- `monitoring_alerts` — genereret fra tærskler og anomalier.

## Data lineage

For hvert datapunkt kan systemet spore:

```
device_measurements.source_payload
  ← device.external_device_id
    ← data_sources.provider
      ← integration_connections (Fase C)
```

For AI-forslag (arter):

```
field_observations
  ← species_recognition_result (embedded i field_observations.metadata)
    ← Lovable AI Gateway model + version
      ← observation_media (billedet)
```

## Retention (foreslået)

- `device_measurements` rå: 3 år, derefter aggregeret time-bucket i separat tabel.
- `integration_runs`: 12 måneder.
- `audit_events`: uendelig (kompliance).
- `field_observations`: uendelig.

## Datakvalitetsmodel (Fase B)

Beregnes pr. `data_source` og pr. `device`, gemt i `data_quality_assessments`:

- **completeness** = modtagne målinger / forventede målinger i perioden.
- **freshness** = 1 – (nu – `last_measurement_at`) / expected_interval × 2.
- **consistency** = 1 – andel målinger uden for statistisk normalområde.
- **validation** = 1 – andel målinger med `validation_flags`.
- **spatial_accuracy** = andel målinger med GPS inden for zone/projekt.
- **temporal_accuracy** = andel målinger hvor `measured_at` er inden for forventet interval fra `received_at`.

Samlet `score` = vægtet gennemsnit. Systemet forklarer altid hvorfor scoren er som den er:

> "Datakvaliteten er 62 %, fordi 18 % af målingerne mangler GPS-position, og sensoren har været offline i 11 timer."
