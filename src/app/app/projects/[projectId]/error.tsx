"use client";

import Link from "next/link";

export default function ProjectError({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
  return <main className="site-shell workspace-query-error" role="alert"><section><h1>Документите во Работниот простор не може да се вчитаат</h1><p>Барањето за документи не успеа. Вашите документи не се отстранети ниту изменети.</p><small>{error.message}</small><div><button className="button button-primary" onClick={reset}>Обиди се повторно</button><Link className="button button-outline" href="/app">Избери проект</Link></div></section></main>;
}
