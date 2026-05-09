-- Add geometry columns to projects table
alter table projects
  add column if not exists geometry_polygon jsonb,
  add column if not exists geometry_centroid_lat numeric,
  add column if not exists geometry_centroid_lng numeric,
  add column if not exists geometry_area_ha numeric,
  add column if not exists geometry_source text default 'none';

-- Index for geo queries
create index if not exists idx_projects_centroid
  on projects(geometry_centroid_lat, geometry_centroid_lng)
  where geometry_centroid_lat is not null;

comment on column projects.geometry_polygon is 'GeoJSON Polygon geometry for the project boundary';
comment on column projects.geometry_centroid_lat is 'Computed centroid latitude';
comment on column projects.geometry_centroid_lng is 'Computed centroid longitude';
comment on column projects.geometry_area_ha is 'Computed area in hectares';
comment on column projects.geometry_source is 'uploaded | manual | estimated | none';
