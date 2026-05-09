-- GoFreyra Seed Data
-- Run after migration 001. Inserts demo org, projects, sites, sources, indicators, reports and audit events.

-- ─── Organization ─────────────────────────────────────────────────────────────
insert into organizations (id, name, type, country) values
  ('00000000-0000-0000-0000-000000000001', 'Freyra Demo', 'Virksomhed', 'Denmark')
on conflict do nothing;

-- ─── Projects ─────────────────────────────────────────────────────────────────
insert into projects (id, organization_id, name, slug, project_type, location_name, municipality, country, status, start_date, end_date, description) values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Skallebæk Biodiversity Pilot',
   'skallebaek-biodiversity-pilot',
   'Biodiversitet',
   'Haderslev',
   'Haderslev',
   'Denmark',
   'Under verifikation',
   '2024-04-01',
   '2027-03-31',
   'Pilotprojekt for naturgenopretning langs Skallebæk med fokus på vandløbsbiodiversitet, vådområder og skovkant.'),

  ('10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'Nordic Coastal Restoration',
   'nordic-coastal-restoration',
   'Vand & hav',
   'Limfjorden',
   NULL,
   'Denmark',
   'Verificeret',
   '2023-01-01',
   '2028-12-31',
   'Storskala genopretning af tang- og ålegræsenge langs den danske kyststrækning.'),

  ('10000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   'Urban Water Quality Program',
   'urban-water-quality-program',
   'Bynatur',
   'København',
   'København',
   'Denmark',
   'Verificeret',
   '2024-01-01',
   '2026-12-31',
   'Forbedring af vandkvalitet og biodiversitet i bynære vandløb og havne i Storkøbenhavn.'),

  ('10000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001',
   'Danish Wetland Restoration',
   'danish-wetland-restoration',
   'Vådområder',
   'Vestjylland',
   NULL,
   'Denmark',
   'Under verifikation',
   '2025-03-01',
   '2028-02-28',
   'Genvådning af lavbundsjorde i Vestjylland for at reducere CO₂-udledning og styrke biodiversitet.')
on conflict do nothing;

-- ─── Sites ────────────────────────────────────────────────────────────────────
insert into sites (id, project_id, name, site_type, area_ha, baseline_status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Zone A — Vandløb',         'Vandløb',    1.4, 'Dokumenteret'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Zone B — Eng og vådområde','Vådområde',  3.2, 'Dokumenteret'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Zone C — Skovkant',        'Skovkant',   1.9, 'Delvist dokumenteret'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'Zone D — Bufferområde',    'Buffer',     0.8, 'Ikke dokumenteret'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'Limfjorden Vest',          'Kystnær',  840.0, 'Dokumenteret'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', 'København Havn',           'Bynær',    120.0, 'Dokumenteret')
on conflict do nothing;

-- ─── Data Sources ─────────────────────────────────────────────────────────────
insert into data_sources (id, project_id, name, source_type, provider, status, last_sync_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Skallebæk vandsensorer',   'IoT sensor',             'Freyra IoT',    'online',    now() - interval '2 minutes'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Feltobservation app',      'Feltobservation',         'Freyra Field',  'partial',   now() - interval '1 hour'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'Scope 3 transport CSV',    'CSV upload',              'Manuel',        'attention', now() - interval '3 days'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'Sentinel-2 NDVI',          'Satellitlag',             'Sentinel Hub',  'online',    now() - interval '6 hours'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000002', 'DMI Klima API',            'API integration',         'DMI',           'online',    now() - interval '12 minutes'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000003', 'ERP energidata',           'ERP data',                'SAP',           'online',    now() - interval '30 minutes'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000004', 'Drone overflight Q2',      'Drone upload',            'Freyra Drone',  'attention', now() - interval '2 days'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'DNV verifikationsfeed',    'Tredjepartsverifikation', 'DNV',           'online',    now() - interval '1 day')
on conflict do nothing;

-- ─── Indicators ───────────────────────────────────────────────────────────────
insert into indicators (id, project_id, key, label, category, value, unit, trend, status) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'biodiversity_index',  'Biodiversitetsindeks',  'Natur',     76,   '/100',  'up',   'ok'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'data_quality',        'Datakvalitet',          'Data',      92,   '%',     'up',   'ok'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'report_readiness',    'Rapportklarhed',        'Rapport',   74,   '%',     'flat', 'warning'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'co2e_reduced',        'CO₂e reduceret',        'Klima',     420,  't CO₂e','up',   'ok'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'area_restored',       'Areal genoprettet',     'Natur',     6.3,  'ha',    'up',   'ok'),
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'active_data_sources', 'Aktive datakilder',     'Data',      12,   '',      'flat', 'ok'),
  ('40000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 'biodiversity_index',  'Biodiversitetsindeks',  'Natur',     82,   '/100',  'up',   'ok'),
  ('40000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000002', 'co2e_reduced',        'CO₂e reduceret',        'Klima',     41200,'t CO₂e','up',   'ok'),
  ('40000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000003', 'biodiversity_index',  'Biodiversitetsindeks',  'Natur',     64,   '/100',  'flat', 'warning'),
  ('40000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000003', 'co2e_reduced',        'CO₂e reduceret',        'Klima',     980,  't CO₂e','up',   'ok')
on conflict do nothing;

-- ─── Reports ──────────────────────────────────────────────────────────────────
insert into reports (id, project_id, title, report_type, status, period_start, period_end, summary) values
  ('50000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Naturimpact-rapport Q1 2026 — Skallebæk',
   'Naturimpact',
   'Klar til review',
   '2026-01-01',
   '2026-03-31',
   'Positiv biodiversitetsudvikling i Zone A og B. Zone C kræver feltverifikation.'),

  ('50000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   'ESG-bilag Q1 2026 — Nordic Coastal',
   'ESG-bilag',
   'Eksporteret',
   '2026-01-01',
   '2026-03-31',
   'Fuld ESG-dokumentation genereret og signeret. Klar til revisors gennemgang.'),

  ('50000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001',
   'Verifikationsrapport — Skallebæk Biodiversity Pilot',
   'Verifikationsrapport',
   'Godkendt',
   '2025-10-01',
   '2025-12-31',
   'Tredjepartsverifikation gennemført af Bureau Veritas. Ingen kritiske fund.')
on conflict do nothing;

-- ─── Audit Events ─────────────────────────────────────────────────────────────
insert into audit_events (id, project_id, event_type, title, description, actor, source, created_at) values
  ('60000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'verification',
   'Tredjepartsreview påbegyndt',
   'Bureau Veritas har påbegyndt review af feltdata og datakilder.',
   'Bureau Veritas',
   'Ekstern',
   now() - interval '4 days'),

  ('60000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   'data_update',
   'Satellitlag opdateret',
   'Sentinel-2 vegetationsindeks opdateret med nye billeder.',
   'Sentinel-2 layer',
   'Automatisk',
   now() - interval '6 days'),

  ('60000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'observation',
   'Feltobservation tilføjet — 12 arter',
   '12 nye artsregistreringer tilføjet af feltteam i Zone B og C.',
   'Feltteam DK-3',
   'Freyra Field',
   now() - interval '16 days'),

  ('60000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000002',
   'report',
   'ESG-bilag genereret og signeret',
   'Q1 ESG-bilag genereret automatisk og digitalt signeret.',
   'Freyra Reporting',
   'Automatisk',
   now() - interval '20 days'),

  ('60000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000003',
   'risk',
   'Risiko-flag gennemgået og lukket',
   'AI-opdaget risiko-flag for vandkvalitet gennemgået og lukket.',
   'AI risk monitor',
   'Automatisk',
   now() - interval '10 days')
on conflict do nothing;

-- ─── Actions ──────────────────────────────────────────────────────────────────
insert into actions (id, project_id, title, description, priority, status, due_date, owner) values
  ('70000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Feltverifikation i Zone C',
   'Planlæg og gennemfør feltverifikation for at dokumentere artsstatus i Zone C.',
   'Høj',
   'Åben',
   '2026-06-20',
   'Emma Larsen'),

  ('70000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Valider vandsensor Zone 3',
   'Planlæg sensor-kalibrering for vandmåler Zone 3 der sender uregelmæssige værdier.',
   'Høj',
   'Åben',
   '2026-06-12',
   'Mikkel Holm'),

  ('70000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001',
   'Geneksporter drone-upload med geotags',
   'Re-eksportér Drone overflight Q2 med EXIF GPS aktiveret.',
   'Medium',
   'Åben',
   '2026-06-15',
   'Mikkel Holm'),

  ('70000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Send dokumentation til ESG Ledger',
   'Overfør Skallebæk Q1-data til ESG Ledger for ESRS-rapportering.',
   'Medium',
   'Åben',
   '2026-06-30',
   'Emma Larsen')
on conflict do nothing;
