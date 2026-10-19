import Image from "next/image";
import loginReference from "../../images/semantIQ_login.png";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { LandingLoginForm } from "./landing-login-form";
import styles from "./landing-login.module.css";

export const dynamic="force-dynamic";
export default async function HomePage({searchParams}:{searchParams:Promise<{error?:string}>}){
 await getAuthenticatedUser({networkFailure:"anonymous"});
 const {error}=await searchParams;
 return <main className={styles.page}><div className={styles.stage}><Image src={loginReference} alt="SemantIQ" fill priority sizes="100vw" className={styles.artwork}/><LandingLoginForm error={error}/></div></main>;
}
