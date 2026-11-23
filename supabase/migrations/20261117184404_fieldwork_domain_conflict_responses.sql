-- Reviewed fixed domain conflicts must terminate through PostgREST. Native
-- PostgreSQL serialization failures are not changed or intercepted.
do $$
declare
  target record; routine regprocedure; definition text; updated text;
  before_acl aclitem[]; before_owner oid; before_definer boolean; before_config text[];
begin
  for target in select * from (values
    ('private.populate_project_approved_time_draft()',2,'freyra.version_conflict'),
    ('private.validate_field_job_insert()',1,'freyra.version_conflict'),
    ('private.validate_field_job_template_insert()',1,'freyra.version_conflict'),
    ('private.validate_field_photo_policy()',1,'freyra.version_conflict'),
    ('private.validate_field_photo_position()',1,'freyra.version_conflict'),
    ('private.validate_project_material_price_insert()',1,'freyra.version_conflict'),
    ('private.validate_project_work_availability_insert()',1,'freyra.version_conflict'),
    ('private.validate_work_order_material_insert()',1,'freyra.version_conflict'),
    ('private.validate_work_order_time_approval()',1,'freyra.version_conflict'),
    ('private.validate_work_order_time_insert()',1,'freyra.version_conflict'),
    ('private.validate_work_order_visit_result()',2,'freyra.version_conflict'),
    ('public.advance_field_photo_background(uuid,uuid)',1,'freyra.lease_conflict'),
    ('public.complete_field_photo_preview(uuid,uuid,text,integer,integer,integer,uuid,text,timestamp with time zone)',1,'freyra.lease_conflict'),
    ('public.complete_field_photo_verification(uuid,uuid,uuid,uuid,text,bigint)',1,'freyra.lease_conflict'),
    ('public.prepare_field_photo_preview_commit(uuid,uuid,text)',1,'freyra.lease_conflict'),
    ('public.save_field_job_template_version(uuid,uuid,uuid,integer,jsonb,uuid)',1,'freyra.version_conflict'),
    ('public.save_field_photo_policy(uuid,uuid,integer,text,integer,uuid)',1,'freyra.version_conflict'),
    ('public.save_field_photo_position(uuid,uuid,uuid,double precision,double precision,text,integer,integer,uuid)',1,'freyra.version_conflict')
  ) as targets(signature, expected_count, detail) loop
    routine := to_regprocedure(target.signature);
    if routine is null then raise exception 'Missing reviewed conflict function: %',target.signature; end if;
    select pg_get_functiondef(p.oid),p.proacl,p.proowner,p.prosecdef,p.proconfig
      into definition,before_acl,before_owner,before_definer,before_config from pg_proc p where p.oid=routine;
    if regexp_count(definition,'''40001''') <> target.expected_count then
      raise exception 'Conflict function changed; review before migration: %',target.signature;
    end if;
    updated := regexp_replace(definition,'ERRCODE[[:space:]]*=[[:space:]]*''40001''',
      'ERRCODE = ''PT409'', DETAIL = '||quote_literal(target.detail),'gi');
    if position('''40001''' in updated)>0 or updated=definition then
      raise exception 'Unreviewed serialization marker: %',target.signature;
    end if;
    execute updated;
    if exists (select 1 from pg_proc p where p.oid=routine and (
      p.proacl is distinct from before_acl or p.proowner is distinct from before_owner
      or p.prosecdef is distinct from before_definer or p.proconfig is distinct from before_config
    )) then raise exception 'Conflict migration changed function security: %',target.signature; end if;
  end loop;
end $$;
