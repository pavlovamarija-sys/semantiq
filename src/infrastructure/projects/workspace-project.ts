import type { SupabaseClient } from "@supabase/supabase-js";

type ProjectCandidate = { id:string; created_at:string };
type DocumentCandidate = { project_id:string; parent_document_id:string|null; derived_from_document_id:string|null; created_at:string };

export function selectWorkspaceProject(projects:ProjectCandidate[],documents:DocumentCandidate[]) {
  const rootsByProject=new Map<string,{count:number;latest:string}>();
  for(const document of documents){
    if(document.parent_document_id||document.derived_from_document_id)continue;
    const current=rootsByProject.get(document.project_id)??{count:0,latest:""};
    rootsByProject.set(document.project_id,{count:current.count+1,latest:current.latest>document.created_at?current.latest:document.created_at});
  }
  return projects.slice().sort((a,b)=>{
    const left=rootsByProject.get(a.id)??{count:0,latest:""},right=rootsByProject.get(b.id)??{count:0,latest:""};
    return right.count-left.count||right.latest.localeCompare(left.latest)||b.created_at.localeCompare(a.created_at);
  })[0]?.id??null;
}

export async function resolveWorkspaceProjectId(supabase:SupabaseClient) {
  const [{data:projects,error:projectError},{data:documents,error:documentError}]=await Promise.all([
    supabase.from("projects").select("id,created_at"),
    supabase.from("documents").select("project_id,parent_document_id,derived_from_document_id,created_at"),
  ]);
  if(projectError)throw new Error(`Unable to resolve Workspace project: ${projectError.message}`);
  if(documentError)throw new Error(`Unable to resolve Workspace documents: ${documentError.message}`);
  return selectWorkspaceProject(projects??[],documents??[]);
}
