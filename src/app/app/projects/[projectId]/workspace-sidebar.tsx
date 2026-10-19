import Link from "next/link";
import { signOut } from "@/app/auth/actions";
import { Brand, Icon } from "@/app/ui/brand";

export function WorkspaceSidebar({ projectId, active, displayName, initials }: { projectId:string; active:"documents"|"import"; displayName:string; initials:string }) {
  return <aside className="dashboard-sidebar workspace-dark-sidebar"><div className="sidebar-brand"><Brand /></div><nav aria-label="Навигација на работниот простор" className="sidebar-nav">
    <Link className={`sidebar-link${active==="documents"?" active":""}`} aria-current={active==="documents"?"page":undefined} href={`/app/projects/${projectId}`}><Icon name="file" />Документи</Link>
    <span className="sidebar-link unavailable" aria-disabled="true"><Icon name="spark" />Превод<small>Наскоро</small></span>
    <span className="sidebar-link unavailable" aria-disabled="true"><Icon name="shield" />Терминологија<small>Наскоро</small></span>
    <span className="sidebar-link unavailable" aria-disabled="true"><Icon name="book" />Преведувачка меморија<small>Наскоро</small></span>
    <Link className="sidebar-link" href="/app/projects"><Icon name="folder" />Проекти</Link>
    <span className="sidebar-link unavailable" aria-disabled="true"><Icon name="book" />Извештаи<small>Наскоро</small></span>
    <Link className={`sidebar-link import-acquis-link${active==="import"?" active":""}`} aria-current={active==="import"?"page":undefined} href={`/app/projects/${projectId}/import`}><Icon name="upload" />Увези правни акти на ЕУ</Link>
  </nav><div className="sidebar-bottom"><span className="sidebar-link unavailable" aria-disabled="true"><Icon name="settings" />Поставки</span><form action={signOut}><button className="sidebar-link" type="submit"><Icon name="logout" />Одјави се</button></form><div className="sidebar-account"><span className="account-avatar">{initials}</span><span>{displayName}</span></div></div></aside>;
}
