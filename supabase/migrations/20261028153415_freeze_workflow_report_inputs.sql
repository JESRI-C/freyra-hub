-- Additive report guard. Historical report generators and versions are unchanged.
-- Typed workflow notes reuse decision_note storage, including direct Data API validation.
create or replace function public.validate_workflow_entry()
returns trigger language plpgsql security invoker set search_path=public as $$
declare j jsonb; source text; field text; allowed text[]; ref jsonb;
begin
 source:=new.payload->>'source';
 if new.kind<>'decision_note' or
   not (source like 'action-execution:%' or source like 'photo-comparison:%' or source like 'workflow-followup:%')
 then return new; end if;
 j:=(new.payload->>'decision')::jsonb;
 if jsonb_typeof(j)<>'object' then raise exception 'Invalid workflow object'; end if;
 if source like 'action-execution:%' then
   allowed:=array['schema','actionId','surveyRoundId','dataBasis','workType','stage','actualDate','actualEndDate',
     'method','reach','performedBy','sourceReference','evidenceIds','deviation','correctionReason','coverage','coverageDescription'];
   if not(j ?& allowed) or j-allowed<>'{}'::jsonb
     or j->>'schema' is distinct from 'freyra.action-execution/v1'
     or source is distinct from 'action-execution:'||new.entry_id::text
     or j->>'actionId' is distinct from new.entry_id::text
     or not exists(select 1 from public.actions a where a.id=new.entry_id and a.project_id=new.project_id)
     or coalesce(j->>'dataBasis','') not in ('real','synthetic','demo')
     or coalesce(j->>'stage','') not in ('planned','performed')
     or coalesce(j->>'workType','') not in ('weed_cutting','other')
     or coalesce(j->>'coverage','') not in ('unknown','limited','documented')
     or jsonb_typeof(j->'evidenceIds') is distinct from 'array'
     or jsonb_array_length(j->'evidenceIds')>20
   then raise exception 'Invalid execution contract'; end if;
   foreach field in array array['reach','sourceReference','deviation','correctionReason','coverageDescription'] loop
     if jsonb_typeof(j->field) is distinct from 'string' or length(j->>field)>2000
     then raise exception 'Invalid execution text'; end if;
   end loop;
   foreach field in array array['method','performedBy'] loop
     if jsonb_typeof(j->field) not in ('string','null') or length(coalesce(j->>field,''))>2000
     then raise exception 'Invalid nullable execution text'; end if;
   end loop;
   foreach field in array array['actualDate','actualEndDate'] loop
     if jsonb_typeof(j->field) is distinct from 'null' then
       if jsonb_typeof(j->field)<>'string' or (j->>field)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       then raise exception 'Invalid execution date'; end if;
       perform (j->>field)::date;
     end if;
   end loop;
   if (j->>'stage'='planned' and (j->>'actualDate' is not null or j->>'actualEndDate' is not null))
     or (j->>'stage'='performed' and (j->>'actualDate' is null or length(btrim(j->>'reach'))=0 or length(btrim(j->>'sourceReference'))=0))
     or (j->>'actualEndDate' is not null and (j->>'actualDate' is null or j->>'actualEndDate'<j->>'actualDate'))
     or (j->>'coverage'<>'unknown' and length(btrim(j->>'coverageDescription'))=0)
     or (new.version>1 and length(btrim(j->>'correctionReason'))=0)
   then raise exception 'Execution date, source or correction reason is incomplete'; end if;
   if j->>'surveyRoundId' is not null and not exists(select 1 from public.survey_round_versions r
     where r.id=(j->>'surveyRoundId')::uuid and r.project_id=new.project_id)
   then raise exception 'Foreign execution round'; end if;
   for ref in select * from jsonb_array_elements(j->'evidenceIds') loop
     if jsonb_typeof(ref)<>'string' or not exists(select 1 from public.evidence_files e
       where e.id=(ref#>>'{}')::uuid and e.project_id=new.project_id)
     then raise exception 'Foreign execution attachment'; end if;
   end loop;
 elsif source like 'photo-comparison:%' then
   allowed:=array['schema','comparisonId','executionRevisionId','beforeId','afterId','parameter','samePlaceEvidence',
     'commonCoverage','coverageDescription','excludedAreas','captureDifferences','conclusion','correctionReason','quantitative'];
   if not(j ?& allowed) or j-allowed<>'{}'::jsonb
     or j->>'schema' is distinct from 'freyra.photo-comparison/v1'
     or source is distinct from 'photo-comparison:'||new.entry_id::text
     or j->>'comparisonId' is distinct from new.entry_id::text
     or j->'quantitative' is distinct from 'false'::jsonb
     or coalesce(j->>'commonCoverage','') not in ('unknown','limited','documented')
     or coalesce(j->>'parameter','') not in ('visible_vegetation','access','other')
     or j->>'beforeId'=j->>'afterId'
     or not exists(select 1 from public.project_workspace_entries e where e.id=(j->>'executionRevisionId')::uuid
       and e.project_id=new.project_id and e.organization_id=new.organization_id
       and e.payload->>'source' like 'action-execution:%')
     or (select count(*) from public.project_media m where m.project_id=new.project_id
       and m.id in ((j->>'beforeId')::uuid,(j->>'afterId')::uuid))<>2
   then raise exception 'Invalid comparison contract'; end if;
   foreach field in array array['samePlaceEvidence','coverageDescription','excludedAreas','captureDifferences','conclusion','correctionReason'] loop
     if jsonb_typeof(j->field) is distinct from 'string' or length(j->>field)>2000
     then raise exception 'Invalid comparison text'; end if;
   end loop;
   if new.version>1 and length(btrim(j->>'correctionReason'))=0 then raise exception 'Comparison correction reason required'; end if;
 else
   allowed:=array['schema','eventKey','title','reason','sourceIds','status','assignee','dueDate','notes','resolutionReason'];
   if not(j ?& allowed) or j-allowed<>'{}'::jsonb
     or j->>'schema' is distinct from 'freyra.workflow-followup/v1'
     or source is distinct from 'workflow-followup:'||new.entry_id::text
     or coalesce(j->>'status','') not in ('proposed','assigned','dismissed','completed')
     or jsonb_typeof(j->'sourceIds') is distinct from 'array'
     or jsonb_array_length(j->'sourceIds') not between 1 and 20
     or length(btrim(coalesce(j->>'eventKey','')))=0 or length(j->>'eventKey')>1000
     or length(btrim(coalesce(j->>'title','')))=0 or length(j->>'title')>200
     or length(btrim(coalesce(j->>'reason','')))=0 or length(j->>'reason')>3000
     or (j->>'status'='assigned' and length(btrim(coalesce(j->>'assignee','')))=0)
     or (j->>'status' in ('dismissed','completed') and length(btrim(coalesce(j->>'resolutionReason','')))=0)
   then raise exception 'Invalid followup contract'; end if;
   if j->>'dueDate' is not null then
     if (j->>'dueDate')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid followup date'; end if;
     perform (j->>'dueDate')::date;
   end if;
   for ref in select * from jsonb_array_elements(j->'sourceIds') loop
     if jsonb_typeof(ref)<>'string' or not exists(select 1 from public.project_workspace_entries e
       where e.id=(ref#>>'{}')::uuid and e.project_id=new.project_id and e.organization_id=new.organization_id)
     then raise exception 'Foreign followup source'; end if;
   end loop;
 end if;
 return new;
end $$;
revoke all on function public.validate_workflow_entry() from public,anon,authenticated;
drop trigger if exists zzz_workflow_entry on public.project_workspace_entries;
create trigger zzz_workflow_entry before insert on public.project_workspace_entries
 for each row execute function public.validate_workflow_entry();

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
       or selected_entry.entry_id::text is distinct from decision->>'actionId'
       or not exists(select 1 from public.actions a where a.id=(decision->>'actionId')::uuid and a.project_id=d.project_id)
       or (w->>'dataBasis'='real' and decision->>'dataBasis' is distinct from 'real')
     then raise exception 'Invalid execution scope or data basis'; end if;
   elsif target like 'photo-comparison:%' then
     if decision->>'schema' is distinct from 'freyra.photo-comparison/v1'
       or decision->'quantitative' is distinct from 'false'::jsonb
       or target is distinct from 'photo-comparison:'||(decision->>'comparisonId')
       or selected_entry.entry_id::text is distinct from decision->>'comparisonId'
       or not exists(select 1 from jsonb_array_elements(w->'inputs') x
         where x->>'id'=decision->>'executionRevisionId' and x->'payload'->>'source' like 'action-execution:%')
       or decision->>'beforeId'=decision->>'afterId'
       or (select count(*) from public.project_media m where m.project_id=d.project_id
         and m.id in ((decision->>'beforeId')::uuid,(decision->>'afterId')::uuid))<>2
     then raise exception 'Invalid comparison scope'; end if;
   elsif target like 'workflow-followup:%' then
     if decision->>'schema' is distinct from 'freyra.workflow-followup/v1'
       or target is distinct from 'workflow-followup:'||selected_entry.entry_id::text
       or jsonb_typeof(decision->'sourceIds') is distinct from 'array'
       or exists(select 1 from jsonb_array_elements_text(decision->'sourceIds') sid
         where not exists(select 1 from public.project_workspace_entries e
           where e.id=sid::uuid and e.project_id=d.project_id and e.organization_id=d.organization_id))
     then raise exception 'Invalid followup scope'; end if;
   else
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

-- Read-only feature probe; the app must not write new snapshots against an old schema.
create or replace function public.workflow_report_contract_version()
returns text language sql immutable security invoker set search_path=public
as $$ select 'freyra.workflow-report/v1'::text $$;
revoke all on function public.workflow_report_contract_version() from public,anon;
grant execute on function public.workflow_report_contract_version() to authenticated;
