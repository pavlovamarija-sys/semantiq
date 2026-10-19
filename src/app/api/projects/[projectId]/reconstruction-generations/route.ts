import { NextResponse } from "next/server";
import { z } from "zod";

import { runReconstructionGeneration } from "@/infrastructure/artifacts/reconstruction-generation";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export const runtime = "nodejs";

const paramsSchema = z.object({ projectId: z.uuid() });
const bodySchema = z.object({
  documentId: z.uuid(), documentVersionId: z.uuid(), sourceArtifactId: z.uuid(),
  requestKey: z.string().trim().min(1).max(160),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsedParams = paramsSchema.safeParse(await params);
  let payload: unknown;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: "A JSON request body is required." }, { status: 400 }); }
  const parsedBody = bodySchema.safeParse(payload);
  if (!parsedParams.success || !parsedBody.success) {
    return NextResponse.json({ error: "Invalid reconstruction request." }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  try {
    const result = await runReconstructionGeneration(supabase, {
      projectId: parsedParams.data.projectId, userId: user.id, ...parsedBody.data,
    });
    return NextResponse.json(result, { status: result.alreadyCompleted ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconstruction failed.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
