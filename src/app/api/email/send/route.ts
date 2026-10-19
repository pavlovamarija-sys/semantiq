import { z } from "zod";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { decryptToken } from "@/infrastructure/email/token-crypto";
const bodySchema=z.object({translatorId:z.string().uuid(),subject:z.string().trim().min(1).max(300),message:z.string().trim().min(1).max(20000),idempotencyKey:z.string().uuid()});
export async function POST(request:Request){
  const user=await getAuthenticatedUser(); if(!user)return Response.json({error:"Не сте најавени."},{status:401});
  const parsed=bodySchema.safeParse(await request.json().catch(()=>null)); if(!parsed.success)return Response.json({error:"Проверете ги предметот и пораката."},{status:400});
  const supabase=await createSupabaseServerClient(); const since=new Date(Date.now()-10*60_000).toISOString();
  const {count}=await supabase.from("sent_email_log").select("id",{count:"exact",head:true}).eq("owner_id",user.id).gte("created_at",since); if((count??0)>=10)return Response.json({error:"Достигнат е лимитот за испраќање. Обидете се подоцна."},{status:429});
  const [{data:translator},{data:connections}]=await Promise.all([supabase.from("translators").select("email").eq("id",parsed.data.translatorId).eq("owner_id",user.id).maybeSingle(),supabase.rpc("get_email_provider_secret")]); const connection=connections?.[0];
  if(!translator)return Response.json({error:"Преведувачот не е пронајден."},{status:404}); if(!connection)return Response.json({error:"Поврзете Gmail или Outlook пред испраќање."},{status:409});
  if(connection.token_expires_at&&new Date(connection.token_expires_at).getTime()<=Date.now())return Response.json({error:"Поврзувањето истече. Поврзете ја е-поштата повторно."},{status:409});
  const {data:log,error:logError}=await supabase.from("sent_email_log").insert({owner_id:user.id,idempotency_key:parsed.data.idempotencyKey,recipient:translator.email,subject:parsed.data.subject,provider:connection.provider,status:"pending"}).select("id").single();
  if(logError?.code==="23505")return Response.json({error:"Оваа порака веќе се испраќа или е испратена."},{status:409}); if(logError||!log)return Response.json({error:"Испраќањето не може да започне."},{status:500});
  try{const access=decryptToken(connection.encrypted_access_token); let response:Response;
    if(connection.provider==="gmail"){const raw=[`From: ${connection.sender_email}`,`To: ${translator.email}`,`Subject: =?UTF-8?B?${Buffer.from(parsed.data.subject).toString("base64")}?=`,`Content-Type: text/plain; charset=UTF-8`,"",parsed.data.message].join("\r\n"); response=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify({raw:Buffer.from(raw).toString("base64url")})});}
    else response=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{authorization:`Bearer ${access}`,"content-type":"application/json"},body:JSON.stringify({message:{subject:parsed.data.subject,body:{contentType:"Text",content:parsed.data.message},toRecipients:[{emailAddress:{address:translator.email}}]},saveToSentItems:true})});
    if(!response.ok)throw new Error(`PROVIDER_${response.status}`); const providerId=response.headers.get("request-id"); await supabase.from("sent_email_log").update({status:"sent",provider_message_id:providerId,sent_at:new Date().toISOString()}).eq("id",log.id).eq("owner_id",user.id); return Response.json({ok:true});
  }catch(error){const code=error instanceof Error?error.message:"PROVIDER_ERROR"; console.error("Email send failed",{ownerId:user.id,provider:connection.provider,code}); await supabase.from("sent_email_log").update({status:"failed",error_code:code.slice(0,100)}).eq("id",log.id).eq("owner_id",user.id); return Response.json({error:"Провајдерот не ја потврди пораката. Обидете се повторно."},{status:502});}
}
