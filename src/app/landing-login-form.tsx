"use client";
import Link from "next/link";
import { useState } from "react";
import { signInFromHome } from "@/app/auth/actions";
import styles from "./landing-login.module.css";

export function LandingLoginForm({error}:{error?:string}){
 const [visible,setVisible]=useState(false);
 return <form action={signInFromHome} className={styles.form}>
  <div className={styles.surface} aria-hidden="true" />
  <h1 className={styles.heading}>Најави се</h1>
  <p className={styles.subtitle}>Продолжете до SemantIQ за управување<br />со вашите преводни проекти.</p>
  <input className={styles.email} name="email" type="email" autoComplete="email" aria-label="Е-пошта" placeholder="Е-пошта" required/>
  <input className={styles.password} name="password" type={visible?"text":"password"} autoComplete="current-password" aria-label="Лозинка" placeholder="Лозинка" required/>
  <button className={styles.showPassword} type="button" onClick={()=>setVisible(value=>!value)} aria-pressed={visible}>{visible?"Сокриј":"Прикажи"}</button>
  <label className={styles.remember}><input name="remember" type="checkbox"/><span>Запомни ме</span></label>
  <Link className={styles.forgot} href="/forgot-password">Ја заборавивте лозинката?</Link>
  <button className={styles.submit} type="submit" aria-label="Најави се">Најави се</button>
  <div className={styles.divider}><span />или<span /></div>
  <span className={styles.accountPrompt}>Немате сметка?</span>
  <Link className={styles.signup} href="/signup" aria-label="Регистрирај се">Регистрирај се</Link>
  {error&&<p className={styles.error} role="alert">{error==="credentials"?"Неточна е-пошта или лозинка.":"Внесете валидна е-пошта и лозинка."}</p>}
 </form>
}
