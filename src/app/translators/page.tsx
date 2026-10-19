import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { TranslatorDirectory } from "./translator-directory";
import { savePersonalTaxForm, type Translator } from "./actions";
import { t } from "@/i18n/ui";
export const dynamic="force-dynamic";
export default async function TranslatorsPage(){
 const user=await getAuthenticatedUser();if(!user)redirect("/login");const supabase=await createSupabaseServerClient();
 const [{data,error},{data:setting},{data:emailConnection}]=await Promise.all([
  supabase.from("translators").select("id,full_name,email,source_language,target_language,specialization,availability,notes,gross_price_per_page_mkd").order("full_name"),
  supabase.from("translator_settings").select("personal_tax_percent").eq("owner_id",user.id).maybeSingle(),
  supabase.from("email_provider_connections").select("provider,sender_email").eq("owner_id",user.id).maybeSingle(),
 ]);if(error)console.error("Translator directory load failed",error);
 const connection=emailConnection?{provider:emailConnection.provider as "gmail"|"outlook",senderEmail:emailConnection.sender_email}:null;
 return <main className="translator-directory-shell"><header className="translator-directory-header"><div><Link href="/" className="translator-back">← EU Acquis AI</Link><p className="eyebrow">{t.peopleAndLanguage}</p><h1>{t.translatorPool}</h1><p>{t.manageLegalTranslators}</p></div><Link href="/app" className="button button-outline">{t.projectsDashboard}</Link></header><form action={savePersonalTaxForm} className="translator-tax-settings"><label htmlFor="personalTax">Персонален данок (%)</label><input id="personalTax" name="personalTax" type="number" min="0" max="100" step="0.01" defaultValue={setting?.personal_tax_percent??""}/><button className="button button-primary">Зачувај</button></form><TranslatorDirectory initialTranslators={(data??[]) as Translator[]} personalTax={setting?.personal_tax_percent??null} emailConnection={connection} loadError={error?"Списокот на преведувачи не може да се вчита.":undefined}/></main>;
}
