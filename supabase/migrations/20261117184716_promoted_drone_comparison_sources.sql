-- The promotion pins the original and its validation receipt. Read only the
-- primary receipt, including when multiple uploads deduplicate to one photo.
create function private.promoted_photo_capture(media public.project_media)
returns table(captured_at timestamptz, capture_date date, lat double precision, lng double precision, sha256 text)
language plpgsql stable strict security invoker
set search_path = '' rows 1 as $$
declare
  validation jsonb;
  capture jsonb;
  position jsonb;
  usable_position boolean;
begin
  select u.original_validation into validation
  from public.uploads u
  where media.original_role = 'drone_original' and media.storage_bucket = 'monitoring-uploads'
    and u.id = media.source_upload_id and u.project_id = media.project_id
    and u.storage_path = media.file_path and u.original_sha256 = media.original_sha256
    and u.original_validation_sha256 = media.original_validation_sha256
    and u.original_validation->>'status' = media.original_validation_status
    and media.original_validation_status in ('raw_original_validated','review_required')
    and u.original_validation #>> '{original,object,id}' = media.storage_object_id::text
    and (u.original_validation #>> '{original,object,version}') is not distinct from media.storage_object_version
    and (u.original_validation #>> '{original,object,updated_at}')::timestamptz = media.storage_object_updated_at;
  if not found then return; end if;

  sha256 := media.original_sha256;
  if validation #>> '{metadata,file,sha256}' = sha256 then
    capture := validation #> '{metadata,capture}';
    if capture->'timezoneKnown' = 'true'::jsonb and capture->>'source' in ('exif-offset','xmp-offset','gps-utc')
      and capture->>'capturedAtUtc' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      begin
        captured_at := (capture->>'capturedAtUtc')::timestamptz;
      exception when data_exception then
        captured_at := null;
      end;
      usable_position := captured_at is not null and validation->'cameraPositionEligible' = 'true'::jsonb;
    elsif capture->'timezoneKnown' = 'false'::jsonb and capture->>'capturedAtUtc' is null
      and capture->>'localTimestamp' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?$' then
      -- The original records a local calendar day even when its UTC instant
      -- is unknown. A date-only comparison never assigns a timezone to it.
      begin
        capture_date := (capture->>'localTimestamp')::timestamp::date;
      exception when data_exception then
        capture_date := null;
      end;
      -- The UTC gate still applies to flight synchronization and automatic
      -- map placement. For comparing calendar days, use only clean camera GPS.
      usable_position := capture_date is not null
        and validation->'cameraPositionEligible' = 'false'::jsonb and validation->>'status' = 'review_required'
        and validation->'errors' = '[]'::jsonb
        and validation #> '{metadata,raw,parseErrors}' = '[]'::jsonb
        and validation #> '{metadata,qa,errors}' = '[]'::jsonb
        and validation #>> '{metadata,qa,status}' = 'review_required'
        and jsonb_path_query_array(validation, '$.metadata.qa.warnings[*].code') = '["CAPTURE_TIMEZONE_UNKNOWN"]'::jsonb;
    end if;
    position := validation #> '{metadata,position}';
    if usable_position
      and position->>'source' in ('exif','xmp')
      and jsonb_typeof(position->'latitude') = 'number' and jsonb_typeof(position->'longitude') = 'number'
      and (position->'latitude') between '-90'::jsonb and '90'::jsonb
      and (position->'longitude') between '-180'::jsonb and '180'::jsonb then
      lat := (position->>'latitude')::double precision;
      lng := (position->>'longitude')::double precision;
    end if;
  end if;
  return next;
end $$;
revoke all on function private.promoted_photo_capture(public.project_media) from public, anon;
grant execute on function private.promoted_photo_capture(public.project_media) to authenticated, service_role;

create function private.set_promoted_photo_capture() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select c.captured_at, case when c.captured_at is not null then c.lat end,
    case when c.captured_at is not null then c.lng end into new.captured_at, new.lat, new.lng
  from private.promoted_photo_capture(new::public.project_media) c;
  return new;
end $$;
revoke all on function private.set_promoted_photo_capture() from public, anon, authenticated;
create trigger project_media_promoted_photo_capture before insert on public.project_media
  for each row when (new.original_role = 'drone_original')
  execute function private.set_promoted_photo_capture();

-- Old promoted rows are immutable. The same receipt supplies their capture
-- fields at read time, under the caller's project and upload read policies.
-- Original checksums for comparisons do not grant report-source eligibility.
create view public.comparison_photo_sources with (security_invoker = true) as
select m.id, m.project_id, m.title, s.captured_at, m.uploaded_at, s.lat, s.lng,
       m.category, m.status, m.action_id, m.before_media_id, s.sha256, null::date as capture_date
from public.project_media m
join public.report_media_sources s on s.id = m.id and s.project_id = m.project_id
where m.original_role is null and m.category in ('field_photo','drone_image')
union all
select m.id, m.project_id, m.title, c.captured_at, m.uploaded_at, c.lat, c.lng,
       m.category, m.status, m.action_id, m.before_media_id, c.sha256, c.capture_date
from public.project_media m
left join lateral private.promoted_photo_capture(m) c on true
where m.original_role = 'drone_original' and m.storage_bucket = 'monitoring-uploads'
  and m.category = 'drone_image';
revoke all on public.comparison_photo_sources from public, anon, authenticated;
grant select on public.comparison_photo_sources to authenticated;
