import { NextResponse } from "next/server";
import { z } from "zod";
import { runCanonicalGeneration } from "@/infrastructure/canonical/canonical-generation";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
export const runtime="nodejs";
const paramsSchema=z.object({projectId:z.uuid()});
const bodySchema=z.object({documentId:z.uuid(),documentVersionId:z.uuid(),validatedDocxArtifactId:z.uuid(),sourceLanguage:z.string().trim().min(2).max(20),requestKey:z.string().trim().min(1).max(160)});
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){const user=await getAuthenticatedUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});const p=paramsSchema.safeParse(await params);let payload:unknown;try{payload=await request.json();}catch{return NextResponse.json({error:"A JSON request body is required."},{status:400});}const b=bodySchema.safeParse(payload);if(!p.success||!b.success)return NextResponse.json({error:"Invalid canonical generation request."},{status:400});try{const result=await runCanonicalGeneration(await createSupabaseServerClient(),{projectId:p.data.projectId,userId:user.id,...b.data});return NextResponse.json(result,{status:result.alreadyCompleted?200:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Canonical extraction failed."},{status:422});}}
