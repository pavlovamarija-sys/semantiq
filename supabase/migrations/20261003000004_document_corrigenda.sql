alter table public.documents
  add column parent_document_id uuid references public.documents(id) on delete restrict,
  add column relation_type text check (relation_type is null or relation_type = 'corrigendum'),
  add column publication_date date,
  add column affected_languages text[],
  add column affects_english boolean;

alter table public.documents add constraint documents_relation_consistent check (
  (parent_document_id is null and relation_type is null)
  or (parent_document_id is not null and relation_type = 'corrigendum')
);

create index documents_parent_document_id_idx on public.documents(parent_document_id)
  where parent_document_id is not null;

comment on column public.documents.parent_document_id is
  'For a corrigendum, the separately stored original document that it corrects.';
