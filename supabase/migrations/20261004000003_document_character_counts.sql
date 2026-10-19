alter table public.document_versions
  add column if not exists characters_without_spaces bigint,
  add column if not exists characters_with_spaces bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_versions_characters_without_spaces_nonnegative'
      and conrelid = 'public.document_versions'::regclass
  ) then
    alter table public.document_versions
      add constraint document_versions_characters_without_spaces_nonnegative
      check (characters_without_spaces is null or characters_without_spaces >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'document_versions_characters_with_spaces_nonnegative'
      and conrelid = 'public.document_versions'::regclass
  ) then
    alter table public.document_versions
      add constraint document_versions_characters_with_spaces_nonnegative
      check (characters_with_spaces is null or characters_with_spaces >= 0);
  end if;
end
$$;

comment on column public.document_versions.characters_without_spaces is
  'Visible textual characters in this exact file version, excluding all whitespace.';
comment on column public.document_versions.characters_with_spaces is
  'Visible textual characters in this exact file version, including ordinary spaces but excluding other whitespace and technical metadata.';
