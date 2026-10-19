-- Existing projects must be assigned to real auth.users before this migration.
-- Deliberately fail on unowned rows rather than assigning a guessed owner.
alter table public.projects
  add column owner_id uuid not null references auth.users(id) on delete restrict;
create index projects_owner_id_idx on public.projects(owner_id);

-- Projects: both old and new rows must belong to the caller on UPDATE.
create policy projects_select_owned on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy projects_insert_owned on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update_owned on public.projects for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy projects_delete_owned on public.projects for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Documents resolve through project_id. The new project_id is checked on writes.
create policy documents_select_owned on public.documents for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy documents_insert_owned on public.documents for insert to authenticated
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy documents_update_owned on public.documents for update to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy documents_delete_owned on public.documents for delete to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

create policy document_versions_select_owned on public.document_versions for select to authenticated
  using (exists (select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = document_id and p.owner_id = (select auth.uid())));
create policy document_versions_insert_owned on public.document_versions for insert to authenticated
  with check (exists (select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = document_id and p.owner_id = (select auth.uid())));
create policy document_versions_update_owned on public.document_versions for update to authenticated
  using (exists (select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = document_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = document_id and p.owner_id = (select auth.uid())));
create policy document_versions_delete_owned on public.document_versions for delete to authenticated
  using (exists (select 1 from public.documents d join public.projects p on p.id = d.project_id
    where d.id = document_id and p.owner_id = (select auth.uid())));

-- Parent segments cannot cross document versions (enforced by the initial composite FK).
create policy document_segments_select_owned on public.document_segments for select to authenticated
  using (exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())));
create policy document_segments_insert_owned on public.document_segments for insert to authenticated
  with check (exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())));
create policy document_segments_update_owned on public.document_segments for update to authenticated
  using (exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())));
create policy document_segments_delete_owned on public.document_segments for delete to authenticated
  using (exists (select 1 from public.document_versions dv join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id
    where dv.id = document_version_id and p.owner_id = (select auth.uid())));

create policy translations_select_owned on public.translations for select to authenticated
  using (exists (select 1 from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where s.id = segment_id and p.owner_id = (select auth.uid())));
create policy translations_insert_owned on public.translations for insert to authenticated
  with check (exists (select 1 from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where s.id = segment_id and p.owner_id = (select auth.uid())));
create policy translations_update_owned on public.translations for update to authenticated
  using (exists (select 1 from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where s.id = segment_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where s.id = segment_id and p.owner_id = (select auth.uid())));
create policy translations_delete_owned on public.translations for delete to authenticated
  using (exists (select 1 from public.document_segments s join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where s.id = segment_id and p.owner_id = (select auth.uid())));

create policy translation_versions_select_owned on public.translation_versions for select to authenticated
  using (exists (select 1 from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id where t.id = translation_id and p.owner_id = (select auth.uid())));
create policy translation_versions_insert_owned on public.translation_versions for insert to authenticated
  with check (exists (select 1 from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id where t.id = translation_id and p.owner_id = (select auth.uid())));
create policy translation_versions_update_owned on public.translation_versions for update to authenticated
  using (exists (select 1 from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id where t.id = translation_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id where t.id = translation_id and p.owner_id = (select auth.uid())));
create policy translation_versions_delete_owned on public.translation_versions for delete to authenticated
  using (exists (select 1 from public.translations t join public.document_segments s on s.id = t.segment_id
    join public.document_versions dv on dv.id = s.document_version_id join public.documents d on d.id = dv.document_id
    join public.projects p on p.id = d.project_id where t.id = translation_id and p.owner_id = (select auth.uid())));

create policy translation_evidence_select_owned on public.translation_evidence for select to authenticated
  using (exists (select 1 from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where tv.id = translation_version_id and p.owner_id = (select auth.uid())));
create policy translation_evidence_insert_owned on public.translation_evidence for insert to authenticated
  with check (exists (select 1 from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where tv.id = translation_version_id and p.owner_id = (select auth.uid())));
create policy translation_evidence_update_owned on public.translation_evidence for update to authenticated
  using (exists (select 1 from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where tv.id = translation_version_id and p.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where tv.id = translation_version_id and p.owner_id = (select auth.uid())));
create policy translation_evidence_delete_owned on public.translation_evidence for delete to authenticated
  using (exists (select 1 from public.translation_versions tv join public.translations t on t.id = tv.translation_id
    join public.document_segments s on s.id = t.segment_id join public.document_versions dv on dv.id = s.document_version_id
    join public.documents d on d.id = dv.document_id join public.projects p on p.id = d.project_id
    where tv.id = translation_version_id and p.owner_id = (select auth.uid())));

-- terminology_entries remains under RLS with no client policies until its scope is designed.
-- Authorization examples: owner A may insert a document under A's project;
-- inserting it under B's project, or changing project_id from A to B, fails WITH CHECK.
-- Updating/deleting B's document fails USING. Anon has no matching policies.
