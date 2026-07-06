"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Research" },
  { href: "/comps", label: "Player Comps" },
  { href: "/leaders", label: "Leaders" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
