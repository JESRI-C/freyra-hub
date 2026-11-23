-- The earlier report triggers lock the document, check the next version and
-- canonicalize sources before this trigger compares the saved review version.
create function public.validate_workflow_report_review_document() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  previous public.report_revisions;
begin
  select * into previous
  from public.report_revisions
  where report_id = new.report_id and version = new.version - 1;

  if previous.content ? 'workflowSnapshot' and not (new.content ? 'workflowSnapshot') then
    raise exception 'Rapportens versionsbundne workflowgrundlag skal bevares.';
  end if;

  if new.status = 'approved' and new.content ? 'workflowSnapshot' and (
    previous.status is distinct from 'review'
    or previous.content #>> '{workflowSnapshot,review,decision}' is distinct from 'accepted'
    or previous.content is distinct from new.content
  ) then
    raise exception 'Gem et accepteret dokumentationsreview af præcis denne rapportversion før godkendelse.';
  end if;
  return new;
end $$;

revoke all on function public.validate_workflow_report_review_document() from public, anon, authenticated;
create trigger zzzz_workflow_report_review_document before insert on public.report_revisions
for each row execute function public.validate_workflow_report_review_document();
