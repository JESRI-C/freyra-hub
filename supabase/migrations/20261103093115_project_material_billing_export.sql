-- Material billing evidence uses the latest quantity and the price at first registration.
alter table public.work_order_material_versions alter column created_at set default clock_timestamp();
create index work_order_material_first_registration
  on public.work_order_material_versions(project_id, organization_id, created_at, entry_id)
  where version=1;

create function public.get_project_material_billing_export(
  p_organization_id uuid, p_project_id uuid, p_from date, p_through date
) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_manage_project(p_project_id) or not exists (
    select 1 from public.projects p where p.id=p_project_id and p.organization_id=p_organization_id
  ) then raise exception 'Project material billing is unavailable' using errcode = '42501'; end if;
  if p_from is null or p_through is null or p_through<p_from or p_through-p_from>=31
    then raise exception 'Select up to 31 days' using errcode = '22023'; end if;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.registered_at,r.entry_id),'[]'::jsonb)
    into result from (
      select original.entry_id, current_version.id as material_version_id,
        current_version.version as material_version, original.action_id, task.title,
        original.actor_id, original.catalog_id, original.material, original.unit,
        original.created_at as registered_at, current_version.quantity_milli,
        price.id as price_version_id, price.version as price_version, price.unit_price_ore,
        (current_version.quantity_milli::bigint * price.unit_price_ore + 500) / 1000 as amount_ore
      from public.work_order_material_versions original
      join public.actions task on task.id=original.action_id and task.project_id=original.project_id
      join lateral (
        select v.id,v.version,v.quantity_milli
          from public.work_order_material_versions v
          where v.entry_id=original.entry_id
            and v.action_id=original.action_id
            and v.organization_id=original.organization_id and v.project_id=original.project_id
          order by v.version desc limit 1
      ) current_version on current_version.quantity_milli>0
      left join lateral (
        select p.id,p.version,p.unit_price_ore
          from public.project_material_unit_prices p
          where p.catalog_id=original.catalog_id
            and p.organization_id=original.organization_id and p.project_id=original.project_id
            and p.created_at<=original.created_at
          order by p.version desc limit 1
      ) price on true
      where original.organization_id=p_organization_id and original.project_id=p_project_id
        and original.version=1
        and original.created_at >= (p_from::timestamp at time zone 'Europe/Copenhagen')
        and original.created_at < ((p_through+1)::timestamp at time zone 'Europe/Copenhagen')
      order by original.created_at,original.entry_id limit 5001
    ) r;
  if jsonb_array_length(result)>5000
    then raise exception 'Select a shorter period' using errcode = '54000'; end if;
  return result;
end $$;
revoke all on function public.get_project_material_billing_export(uuid,uuid,date,date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_project_material_billing_export(uuid,uuid,date,date) to authenticated;
