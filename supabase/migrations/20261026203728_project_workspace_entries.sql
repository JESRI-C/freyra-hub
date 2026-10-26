-- Shared append-only registrations for the existing project tabs. No customer data is rewritten.
create table public.project_workspace_entries (
 id uuid primary key default gen_random_uuid(),
 entry_id uuid not null default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 project_id uuid not null references public.projects(id),
 kind text not null check (kind in ('scenario','stakeholder','decision_note','esrs','co2_entry','funding','partner','public_page')),
 version integer not null check (version>0),
 title text not null check (length(btrim(title)) between 1 and 200),
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=100000),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 unique(entry_id,version)
);
create index project_workspace_scope on public.project_workspace_entries(organization_id,project_id,kind);
alter table public.project_workspace_entries enable row level security;
revoke all on public.project_workspace_entries from public,anon,authenticated;
grant select,insert on public.project_workspace_entries to authenticated;
create policy workspace_read on public.project_workspace_entries for select to authenticated using (
 public.is_org_member(auth.uid(),organization_id)
 and exists(select 1 from public.projects p where p.id=project_id and p.organization_id=project_workspace_entries.organization_id)
);
create policy workspace_insert on public.project_workspace_entries for insert to authenticated with check (
 created_by=auth.uid() and public.is_org_member(auth.uid(),organization_id)
 and exists(select 1 from public.projects p where p.id=project_id and p.organization_id=project_workspace_entries.organization_id)
 and (public.has_org_role(auth.uid(),organization_id,array['owner','admin','editor'])
 or public.has_project_role(project_id,auth.uid(),'admin') or public.has_project_role(project_id,auth.uid(),'project_manager') or public.has_project_role(project_id,auth.uid(),'editor'))
);
create function public.validate_workspace_entry() returns trigger language plpgsql security invoker set search_path=public as $$
declare previous public.project_workspace_entries; field text; required text[]; allowed text[];
begin
 if new.created_by is distinct from auth.uid() then raise exception 'Invalid actor'; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.entry_id::text,0));
 select * into previous from public.project_workspace_entries where entry_id=new.entry_id order by version desc limit 1;
 if previous.id is null then
  if new.version<>1 then raise exception 'Version conflict; reload'; end if;
 elsif new.version<>previous.version+1 or new.project_id<>previous.project_id or new.organization_id<>previous.organization_id or new.kind<>previous.kind then
  raise exception 'Version or project conflict; reload';
 end if;
 case new.kind
 when 'scenario' then allowed:=array['horizon','focus','investment','assumptions','expectedEffect','source']; required:=array['assumptions','source'];
 when 'stakeholder' then allowed:=array['role','area','status','owner','source','notes']; required:=array[]::text[];
 when 'decision_note' then allowed:=array['basis','alternatives','decision','uncertainty','owner','source']; required:=array['basis','source'];
 when 'esrs' then allowed:=array['code','status','owner','source','notes']; required:=array['code','notes'];
 when 'co2_entry' then allowed:=array['category','quantity','period','boundary','method','source']; required:=array['quantity','period','boundary','method','source'];
 when 'funding' then allowed:=array['organization','amount','status','deadline','source','notes']; required:=array['organization'];
 when 'partner' then allowed:=array['type','role','contact','source','notes']; required:=array['role'];
 when 'public_page' then allowed:=array['summary','results','limitations','source']; required:=array['summary','limitations','source'];
 else raise exception 'Unknown entry kind';
 end case;
 if exists(select 1 from jsonb_each(new.payload) p where not(p.key=any(allowed)) or jsonb_typeof(p.value)<>'string' or length(p.value#>>'{}')>10000) then raise exception 'Invalid fields'; end if;
 foreach field in array required loop
  if coalesce(length(btrim(new.payload->>field)),0)=0 then raise exception 'Required field: %',field; end if;
 end loop;
 foreach field in array array['horizon','quantity','amount'] loop
  if coalesce(new.payload->>field,'')<>'' then
   if (new.payload->>field)!~'^[0-9]+(\.[0-9]+)?$' then raise exception 'Invalid nonnegative number'; end if;
  end if;
 end loop;
 if coalesce(new.payload->>'deadline','')<>'' then perform (new.payload->>'deadline')::date; end if;
 new.title:=btrim(new.title); new.created_at:=now();
 return new;
end $$;
revoke all on function public.validate_workspace_entry() from public,anon,authenticated;
create trigger workspace_validate before insert on public.project_workspace_entries for each row execute function public.validate_workspace_entry();
create function public.audit_workspace_entry() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.audit_events(project_id,event_type,title,actor,source,entity_type,entity_id,after_data)
 values(new.project_id,'workspace_revision',new.title,new.created_by::text,'project_workspace','project_workspace_entries',new.entry_id,jsonb_build_object('version',new.version,'kind',new.kind,'revision_id',new.id));
 return new;
end $$;
revoke all on function public.audit_workspace_entry() from public,anon,authenticated;
create trigger workspace_audit after insert on public.project_workspace_entries for each row execute function public.audit_workspace_entry();
