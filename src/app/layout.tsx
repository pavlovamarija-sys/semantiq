import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EU Acquis AI — Платформа за превод", description: "Професионална платформа за превод на правото на Европската Унија." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="mk" data-scroll-behavior="smooth"><body>{children}</body></html>; }
