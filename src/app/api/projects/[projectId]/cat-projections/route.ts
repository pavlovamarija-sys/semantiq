import { NextResponse } from "next/server";
import { z } from "zod";
import { persistCatProjection } from "@/infrastructure/cat/cat-projection";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export const runtime="nodejs";
const paramsSchema=z.object({projectId:z.uuid()});
const fieldsSchema=z.object({documentId:z.uuid(),documentVersionId:z.uuid(),canonicalSnapshotId:z.uuid(),requestKey:z.string().trim().min(1).max(160)});
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
 const user=await getAuthenticatedUser();if(!user)return NextResponse.json({error:"Authentication required."},{status:401});
 const parsedParams=paramsSchema.safeParse(await params);let form:FormData;try{form=await request.formData();}catch{return NextResponse.json({error:"A multipart form body is required."},{status:400});}
 const fields=fieldsSchema.safeParse({documentId:form.get("documentId"),documentVersionId:form.get("documentVersionId"),canonicalSnapshotId:form.get("canonicalSnapshotId"),requestKey:form.get("requestKey")});const sdlxliff=form.get("sdlxliff"),studioProject=form.get("studioProject");
 if(!parsedParams.success||!fields.success||!(sdlxliff instanceof File)||!(studioProject instanceof File))return NextResponse.json({error:"Invalid CAT projection request."},{status:400});
 if(sdlxliff.size>20_000_000||studioProject.size>5_000_000)return NextResponse.json({error:"Studio input exceeds the controlled size limit."},{status:413});
 try{const result=await persistCatProjection(await createSupabaseServerClient(),{projectId:parsedParams.data.projectId,userId:user.id,...fields.data,sdlxliffBytes:new Uint8Array(await sdlxliff.arrayBuffer()),studioProjectBytes:new Uint8Array(await studioProject.arrayBuffer())});return NextResponse.json(result,{status:result.alreadyCompleted?200:201});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:"CAT projection failed."},{status:422});}
}
