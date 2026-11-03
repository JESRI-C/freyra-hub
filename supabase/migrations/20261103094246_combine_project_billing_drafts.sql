-- Extend the existing billing drafts while keeping historic time-only receipts valid.
alter table public.project_approved_time_drafts
  add column material_refs jsonb check (material_refs is null or jsonb_typeof(material_refs)='array'),
  add column material_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(material_snapshot)='array');
grant insert (material_refs) on public.project_approved_time_drafts to authenticated;

create or replace function private.populate_project_approved_time_draft() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare current_rows jsonb; current_ids uuid[]; current_material_refs jsonb;
begin
  if new.rate_ore is null or new.rate_ore not between 0 and 99999999
    or coalesce(cardinality(new.time_ids),0) not between 1 and 5000
  then raise exception 'Invalid draft input' using errcode = '22023'; end if;
  select public.get_project_approved_time_export(
    new.organization_id,new.project_id,new.date_from,new.date_through
  ), case when new.material_refs is not null then public.get_project_material_billing_export(
    new.organization_id,new.project_id,new.date_from,new.date_through
  ) else '[]'::jsonb end
  into current_rows,new.material_snapshot;

  if new.material_refs is not null then
    select coalesce(jsonb_agg(jsonb_build_array(
      r.value->>'material_version_id',r.value->>'price_version_id'
    ) order by r.ordinality),'[]'::jsonb)
    into current_material_refs
    from jsonb_array_elements(new.material_snapshot) with ordinality r(value,ordinality);
    if current_material_refs is distinct from new.material_refs
      then raise exception 'Material usage or price changed' using errcode = '40001'; end if;
  end if;
  select array_agg((r.value->>'time_id')::uuid order by r.ordinality),
    coalesce(sum(((r.value->>'minutes')::bigint*new.rate_ore+30)/60),0)
  into current_ids,new.total_ore
  from jsonb_array_elements(current_rows) with ordinality r(value,ordinality);
  if current_ids is distinct from new.time_ids
    then raise exception 'Approved time changed' using errcode = '40001'; end if;
  new.snapshot := current_rows;
  new.created_at := now();
  return new;
end $$;
