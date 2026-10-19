alter table public.documents
  drop constraint if exists documents_transformation_status_check;

alter table public.documents
  add constraint documents_transformation_status_check
  check (transformation_status is null or transformation_status in ('processing', 'ready', 'failed', 'needs_review'));
