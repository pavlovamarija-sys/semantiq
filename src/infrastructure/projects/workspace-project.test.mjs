import test from "node:test";
import assert from "node:assert/strict";
import {selectWorkspaceProject} from "./workspace-project.ts";

test("selects the owned project containing the most visible Workspace roots",()=>{
  const projects=[{id:"new-empty",created_at:"2026-10-13"},{id:"original",created_at:"2026-10-03"}];
  const documents=[
    ...Array.from({length:6},(_,index)=>({project_id:"original",parent_document_id:null,derived_from_document_id:null,created_at:`2026-10-${String(index+1).padStart(2,"0")}`})),
    {project_id:"original",parent_document_id:"root",derived_from_document_id:null,created_at:"2026-10-10"},
    {project_id:"original",parent_document_id:null,derived_from_document_id:"root",created_at:"2026-10-11"},
  ];
  assert.equal(selectWorkspaceProject(projects,documents),"original");
});

test("falls back deterministically when every owned project is empty",()=>{
  assert.equal(selectWorkspaceProject([{id:"old",created_at:"2026-01-01"},{id:"new",created_at:"2026-02-01"}],[]),"new");
});
