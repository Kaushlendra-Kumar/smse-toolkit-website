"use client";

import clsx from "clsx";
import { Hexagon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { TOOLS } from "@/lib/tools";

function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-6 overflow-x-auto px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Hexagon className="size-5 text-accent" aria-hidden />
          <span className="max-sm:sr-only">SMSE AI Toolkit</span>
        </Link>
        <ul className="ml-auto flex items-center gap-1 text-sm md:ml-0">
          {TOOLS.map((t) => {
            const active = pathname?.startsWith(t.href) ?? false;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  title={t.name}
                  aria-label={t.name}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 transition",
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <t.icon className="size-4" aria-hidden />
                  <span className="hidden lg:inline">{t.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

function ActiveNav() {
  return <NavBar pathname={usePathname()} />;
}

/** The pathname is request data on dynamic routes, so it streams in; the fallback is the same bar unhighlighted. */
export function Nav() {
  return (
    <Suspense fallback={<NavBar pathname={null} />}>
      <ActiveNav />
    </Suspense>
  );
}
