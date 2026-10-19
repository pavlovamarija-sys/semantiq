import Link from "next/link";
import type { ReactNode } from "react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" className="inline-flex items-center gap-3 text-[#09265e]" aria-label="EU Acquis AI home">
    <svg aria-hidden="true" viewBox="0 0 38 38" className="h-9 w-9 shrink-0 fill-none"><path d="M5 20.5 16 10v24H5V20.5Z" stroke="currentColor" strokeWidth="2"/><path d="M19 8 29 3v31H19V8Z" fill="currentColor"/><path d="m21 17 11-7v24H21V17Z" fill="currentColor" opacity=".72"/><path d="m5 20 11-7M19 10l10-5" stroke="#fff" strokeWidth="1.5"/></svg>
    <span className={`font-semibold tracking-[-.04em] ${compact ? "text-lg" : "text-xl"}`}>EU Acquis AI</span>
  </Link>;
}

type IconName = "book" | "spark" | "shield" | "folder" | "file" | "fileText" | "calendar" | "hash" | "download" | "upload" | "refresh" | "package" | "external" | "more" | "search" | "plus" | "check" | "home" | "settings" | "logout" | "trash";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    book: <><path d="M12 6c-2-2-5-2-9-1v14c4-1 7-1 9 1 2-2 5-2 9-1V5c-4-1-7-1-9 1Z"/><path d="M12 6v14M6 8h3M15 8h3"/></>,
    spark: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2ZM19 2v4M17 4h4"/></>,
    shield: <><path d="m12 2 9 4v6c0 5-3.5 8-9 10-5.5-2-9-5-9-10V6l9-4Z"/><path d="m8 12 3 3 5-6"/></>,
    folder: <path d="M3 6h7l2 2h9v11H3V6Z"/>,
    file: <><path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h4M9 12h6M9 16h6"/></>,
    fileText: <><path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h4M9 12h6M9 16h6"/></>,
    calendar: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></>,
    hash: <><path d="M10 3 8 21M16 3l-2 18M4 9h17M3 15h17"/></>,
    download: <><path d="M12 3v12M7 11l5 5 5-5M4 20h16"/></>,
    upload: <><path d="M12 16V4M7 8l5-5 5 5M4 20h16"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.7-3L3 11M3 5v6h6M4 13a8 8 0 0 0 14.7 3L21 13M21 19v-6h-6"/></>,
    package: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21"/></>,
    external: <><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></>,
    plus: <path d="M12 4v16M4 12h16"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    home: <><path d="m3 10 9-7 9 7v11H3V10Z"/><path d="M9 21v-7h6v7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M10 2h4l1 3 3 1 3-1 2 4-2 2v3l2 2-2 4-3-1-3 1-1 3h-4l-1-3-3-1-2-4 2-2v-3L1 9l2-4 3 1 3-1 1-3Z"/></>,
    logout: <><path d="M10 3H4v18h6M14 7l5 5-5 5M8 12h11"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
