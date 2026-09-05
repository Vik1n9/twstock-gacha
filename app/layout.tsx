import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { LowFxToggle } from "@/components/ui/LowFxToggle";

export const metadata: Metadata = {
  title: "台股抽卡所",
  description: "以真實台股行情驅動的抽卡遊戲 — 板塊卡池系統 Alpha",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
          <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <Link href="/" className="font-bold tracking-wide">
              台股<span className="text-[var(--gold)]">抽卡</span>所
            </Link>
            <div className="flex flex-1 items-center gap-5 text-sm">
              <Link href="/" className="dim hover:text-[var(--ink)]">
                抽卡
              </Link>
              <Link href="/history" className="dim hover:text-[var(--ink)]">
                紀錄
              </Link>
              <Link href="/pools" className="dim hover:text-[var(--ink)]">
                卡池
              </Link>
              <Link href="/odds" className="dim hover:text-[var(--ink)]">
                機率說明
              </Link>
            </div>
            <LowFxToggle />
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
      </body>
    </html>
  );
}
