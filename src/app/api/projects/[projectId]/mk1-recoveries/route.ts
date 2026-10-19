import { NextResponse } from "next/server";
import { z } from "zod";
import { recoverAndPersistCanonicalMk1 } from "@/infrastructure/translation/canonical-mk1-recovery-generation";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export const runtime = "nodejs";
const paramsSchema=z.object({projectId:z.uuid()});
const bodySchema=z.object({documentId:z.uuid(),documentVersionId:z.uuid(),canonicalSnapshotId:z.uuid(),catProjectionId:z.uuid(),
  sdlxliffArtifactId:z.uuid(),validatedDocxArtifactId:z.uuid(),sourceGenerationId:z.uuid(),sourceRunId:z.uuid(),
  celex:z.string().regex(/^\d{5}[A-Z]\d{4}$/i),requestKey:z.string().trim().min(1).max(160)}).strict();

export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
  const user=await getAuthenticatedUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
  const parsedParams=paramsSchema.safeParse(await params);let json:unknown;try{json=await request.json();}catch{return NextResponse.json({error:"A JSON body is required."},{status:400});}
  const body=bodySchema.safeParse(json);if(!parsedParams.success||!body.success)return NextResponse.json({error:"Invalid MK1 recovery request."},{status:400});
  try{const result=await recoverAndPersistCanonicalMk1(await createSupabaseServerClient(),{projectId:parsedParams.data.projectId,userId:user.id,...body.data});return NextResponse.json(result,{status:result.alreadyCompleted?200:201});}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"MK1 recovery failed."},{status:422});}
}
