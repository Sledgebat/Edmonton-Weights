"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModeToggle } from "@/components/theme/ThemeControls";
import { NAV, isActive } from "@/lib/nav";
import { Rivets } from "./Rivets";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 leading-none" aria-label="EdmontonWeights, home">
      <span className="display-hero whitespace-nowrap text-2xl text-header-fg sm:text-3xl">
        Edmonton<span className="text-header-accent">Weights</span>
      </span>
      <span className="hidden text-header-accent sm:inline-flex">
        <Rivets size={5} />
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Wordmark />
        <div className="flex items-center gap-2">
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`display relative block whitespace-nowrap px-3 py-2 text-lg tracking-wide transition hover:text-header-accent ${
                        active ? "after:absolute after:inset-x-3 after:-bottom-0.5 after:h-[3px] after:bg-header-accent" : "opacity-90"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <ModeToggle />
        </div>
      </div>
      <div className="sleeve-stripes-thin" aria-hidden />
    </header>
  );
}
