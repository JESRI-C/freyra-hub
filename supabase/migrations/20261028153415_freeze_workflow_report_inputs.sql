-- Additive report guard. Historical report generators and versions are unchanged.
create or replace function public.validate_workflow_report_snapshot()
returns trigger language plpgsql security invoker set search_path=public as $$
declare
 d public.report_documents; w jsonb; item jsonb; stored jsonb; decision jsonb;
 selected_entry public.project_workspace_entries; target text;
begin
 if not (new.content ? 'workflowSnapshot') then return new; end if;
 select * into d from public.report_documents where id=new.report_id;
 w:=new.content->'workflowSnapshot';
 if d.id is null or jsonb_typeof(w)<>'object'
   or w->>'schema' is distinct from 'freyra.workflow-report/v1'
   or w->>'generatorVersion' is distinct from 'workflow-report/v1'
   or w->>'projectId' is distinct from d.project_id::text
   or w->>'organizationId' is distinct from d.organization_id::text
   or coalesce(w->>'dataBasis','') not in ('real','synthetic')
   or jsonb_typeof(w->'inputs') is distinct from 'array'
   or jsonb_array_length(w->'inputs') not between 1 and 300
   or jsonb_typeof(w->'rounds') is distinct from 'array'
   or jsonb_typeof(w->'baselines') is distinct from 'array'
   or jsonb_typeof(w->'plans') is distinct from 'array'
   or jsonb_typeof(w->'limitations') is distinct from 'array'
 then raise exception 'Invalid workflow snapshot'; end if;
 if (select count(*) from jsonb_array_elements(w->'inputs')) <>
    (select count(distinct x->>'id') from jsonb_array_elements(w->'inputs') x)
 then raise exception 'Duplicate workflow input'; end if;
 for item in select * from jsonb_array_elements(w->'inputs') loop
   select * into selected_entry from public.project_workspace_entries
    where id=(item->>'id')::uuid and project_id=d.project_id and organization_id=d.organization_id;
   if selected_entry.id is null or selected_entry.kind<>'decision_note'
     or (to_jsonb(selected_entry)-'created_at') is distinct from (item-'created_at')
     or selected_entry.created_at is distinct from (item->>'created_at')::timestamptz
   then raise exception 'Workflow input changed or outside project'; end if;
   if exists(select 1 from public.project_workspace_entries e
     where e.entry_id=selected_entry.entry_id and e.version>selected_entry.version
       and not exists(select 1 from jsonb_array_elements(w->'inputs') x where x->>'id'=e.id::text))
   then raise exception 'Workflow input changed; reload before saving'; end if;
   decision:=(selected_entry.payload->>'decision')::jsonb;
   target:=selected_entry.payload->>'source';
   if target like 'action-execution:%' then
     if decision->>'schema' is distinct from 'freyra.action-execution/v1'
       or target is distinct from 'action-execution:'||(decision->>'actionId')
       or not exists(select 1 from public.actions a where a.id=(decision->>'actionId')::uuid and a.project_id=d.project_id)
       or (w->>'dataBasis'='real' and decision->>'dataBasis' is distinct from 'real')
     then raise exception 'Invalid execution scope or data basis'; end if;
   elsif target like 'photo-comparison:%' then
     if decision->>'schema' is distinct from 'freyra.photo-comparison/v1'
       or decision->'quantitative' is distinct from 'false'::jsonb
       or target is distinct from 'photo-comparison:'||(decision->>'comparisonId')
       or not exists(select 1 from jsonb_array_elements(w->'inputs') x
         where x->>'id'=decision->>'executionRevisionId' and x->'payload'->>'source' like 'action-execution:%')
       or decision->>'beforeId'=decision->>'afterId'
       or (select count(*) from public.project_media m where m.project_id=d.project_id
         and m.id in ((decision->>'beforeId')::uuid,(decision->>'afterId')::uuid))<>2
     then raise exception 'Invalid comparison scope'; end if;
   elsif target not like 'workflow-followup:%' then
     raise exception 'Unknown workflow input';
   end if;
 end loop;
 for item in select * from jsonb_array_elements(w->'rounds') loop
   select jsonb_build_object('id',r.id,'sha256',r.manifest_sha256,'baselineId',r.baseline_id,'planId',r.plan_id)
     into stored from public.survey_round_versions r where r.id=(item->>'id')::uuid and r.project_id=d.project_id;
   if stored is null or stored is distinct from item then raise exception 'Invalid round snapshot'; end if;
 end loop;
 for item in select * from jsonb_array_elements(w->'baselines') loop
   select jsonb_build_object('id',b.id,'sha256',b.manifest_sha256,'manifest',b.manifest)
     into stored from public.project_baseline_snapshots b where b.id=(item->>'id')::uuid and b.project_id=d.project_id;
   if stored is null or stored is distinct from item then raise exception 'Invalid baseline snapshot'; end if;
 end loop;
 for item in select * from jsonb_array_elements(w->'plans') loop
   select jsonb_build_object('id',p.id,'sha256',p.manifest_sha256,'manifest',p.manifest)
     into stored from public.verification_plan_versions p where p.id=(item->>'id')::uuid and p.project_id=d.project_id;
   if stored is null or stored is distinct from item then raise exception 'Invalid plan snapshot'; end if;
 end loop;
 if new.status='approved' and (
   w->>'dataBasis'<>'real' or w->'review'->>'scope' is distinct from 'documentation'
   or w->'review'->>'decision' is distinct from 'accepted'
   or length(btrim(coalesce(w->'review'->>'reason','')))=0
   or jsonb_typeof(w->'review'->'inputIds') is distinct from 'array'
   or jsonb_array_length(w->'review'->'inputIds')<>jsonb_array_length(w->'inputs')
   or exists(select 1 from jsonb_array_elements(w->'inputs') x
      where not (w->'review'->'inputIds' @> jsonb_build_array(x->>'id')))
   or jsonb_typeof(w->'review'->'sectionTexts') is distinct from 'object'
   or exists(select 1 from jsonb_array_elements(new.content->'sections') s
     where w->'review'->'sectionTexts'->>(s->>'id') is distinct from s->>'text')
 ) then raise exception 'Exact documentation review required; no nature effect approval'; end if;
 return new;
end $$;
revoke all on function public.validate_workflow_report_snapshot() from public,anon,authenticated;
drop trigger if exists zzz_workflow_report_snapshot on public.report_revisions;
create trigger zzz_workflow_report_snapshot before insert on public.report_revisions
 for each row execute function public.validate_workflow_report_snapshot();
