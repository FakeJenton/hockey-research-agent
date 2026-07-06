import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Hockey Research Agent",
  description:
    "Natural-language NHL analytics: a Claude-powered SQL agent and player similarity engine on a BigQuery + dbt warehouse.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-zinc-950 font-sans text-zinc-100">
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 py-5">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Hockey Research Agent</h1>
              <p className="text-xs text-zinc-500">NHL API → BigQuery → dbt → Claude</p>
            </div>
            <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-sm">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-zinc-800">
                Research
              </Link>
              <Link href="/comps" className="rounded-md px-3 py-1.5 hover:bg-zinc-800">
                Player Comps
              </Link>
              <Link href="/leaders" className="rounded-md px-3 py-1.5 hover:bg-zinc-800">
                Leaders
              </Link>
            </nav>
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="border-t border-zinc-800 py-5 text-xs text-zinc-600">
            Uses publicly available NHL API data. Not affiliated with or endorsed by the NHL or any
            team. Data: 2024-25 and 2025-26 regular seasons.
          </footer>
        </div>
      </body>
    </html>
  );
}
