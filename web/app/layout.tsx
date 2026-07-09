import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import { Nav } from "./nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "Natural-language NHL analytics: a Claude-powered SQL agent, expected-goals model, and player similarity engine on a BigQuery + dbt warehouse.";

export const metadata: Metadata = {
  title: {
    default: "Hockey Research Agent",
    template: "%s · Hockey Research Agent",
  },
  description: DESCRIPTION,
  openGraph: {
    title: "Hockey Research Agent",
    description: DESCRIPTION,
    type: "website",
    siteName: "Hockey Research Agent",
  },
};

function PuckMark() {
  return (
    <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#27272a" />
      <rect x="14" y="30" width="36" height="8" fill="#f59e0b" />
      <ellipse cx="32" cy="38" rx="18" ry="7" fill="#f59e0b" />
      <ellipse cx="32" cy="30" rx="18" ry="7" fill="#fbbf24" />
    </svg>
  );
}

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
            <Link href="/" className="flex items-center gap-3">
              <PuckMark />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">Hockey Research Agent</h1>
                  <span className="hidden rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline">
                    1917-18 → 2025-26
                  </span>
                </div>
                <p className="text-xs text-zinc-500">Conversational analytics for a century of hockey</p>
              </div>
            </Link>
            <Nav />
          </header>
          <main className="flex-1 py-8">{children}</main>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 py-5 text-xs text-zinc-600">
            <span>
              Built on BigQuery, dbt, and Claude. Uses publicly available NHL API data; not
              affiliated with or endorsed by the NHL or any team.
            </span>
            <a
              href="https://github.com/FakeJenton/hockey-research-agent"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
            >
              Source on GitHub
            </a>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
