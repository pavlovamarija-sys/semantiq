import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createSupabaseExactArtifactAccess, ExactArtifactReadError, readExactArtifact, safeArtifactDownloadName,
} from "@/infrastructure/artifacts/exact-artifact-readback";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export const runtime = "nodejs";
const paramsSchema=z.object({projectId:z.uuid(),artifactId:z.uuid()});

export async function GET(_request:Request,{params}:{params:Promise<{projectId:string;artifactId:string}>}){
  const user=await getAuthenticatedUser();
  if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const parsed=paramsSchema.safeParse(await params);
  if(!parsed.success)return NextResponse.json({error:"Invalid artifact reference."},{status:400});
  const supabase=await createSupabaseServerClient();
  const access=createSupabaseExactArtifactAccess(supabase);
  try{
    const result=await readExactArtifact(access.repository,access.storage,parsed.data.projectId,parsed.data.artifactId);
    return new Response(result.bytes.slice().buffer as ArrayBuffer,{status:200,headers:{
      "Content-Type":result.artifact.mimeType,
      "Content-Length":String(result.artifact.byteSize),
      "Content-Disposition":`attachment; filename="${safeArtifactDownloadName(result.artifact)}"`,
      "Cache-Control":"private, no-store",
      "X-Content-Type-Options":"nosniff",
    }});
  }catch(error){
    if(error instanceof ExactArtifactReadError){
      if(error.code==="not_found")return NextResponse.json({error:error.message},{status:404});
      if(error.code==="unavailable")return NextResponse.json({error:error.message},{status:409});
      return NextResponse.json({error:"Artifact failed integrity verification."},{status:409});
    }
    return NextResponse.json({error:"Artifact readback failed."},{status:500});
  }
}
