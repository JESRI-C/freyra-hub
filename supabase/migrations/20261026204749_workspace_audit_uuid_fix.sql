create or replace function public.audit_workspace_entry() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.audit_events(project_id,event_type,title,actor,source,entity_type,entity_id,after_data)
 values(new.project_id,'workspace_revision',new.title,new.created_by::text,'project_workspace','project_workspace_entries',new.entry_id,jsonb_build_object('version',new.version,'kind',new.kind,'revision_id',new.id));
 return new;
end $$;
revoke all on function public.audit_workspace_entry() from public,anon,authenticated;
