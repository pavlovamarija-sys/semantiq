import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
export async function DELETE() { const user=await getAuthenticatedUser(); if(!user)return Response.json({error:"Не сте најавени."},{status:401}); const supabase=await createSupabaseServerClient(); const {error}=await supabase.rpc("disconnect_email_provider"); if(error)return Response.json({error:"Поврзувањето не може да се отстрани."},{status:500}); return Response.json({ok:true}); }
