"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EraPicker, ModeToggle, SpoilerToggle } from "@/components/theme/ThemeControls";
import { ALL_NAV, isActive } from "@/lib/nav";
import { Rivets } from "./Rivets";

export function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-2 leading-none" aria-label="Oil Country Hub, home">
      <span className="display-hero whitespace-nowrap text-2xl text-header-fg sm:text-3xl">
        Oil Country <span className="wordmark-accent text-header-accent">Hub</span>
      </span>
      <span className="hidden text-header-accent sm:inline-flex lg:hidden xl:inline-flex">
        <Rivets size={5} />
      </span>
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-header text-header-fg shadow-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6">
        <Wordmark />

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center">
            {ALL_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`display relative block whitespace-nowrap px-1.5 py-2 text-[15px] tracking-wide transition hover:text-header-accent xl:px-2.5 xl:text-lg ${
                      active ? "after:absolute after:inset-x-1.5 xl:after:inset-x-2.5 after:-bottom-0.5 after:h-[3px] after:bg-header-accent" : "opacity-90"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
          <EraPicker />
          <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-white/20 sm:block" />
          <ModeToggle />
          <SpoilerToggle />
        </div>
      </div>
      <div className="sleeve-stripes-thin" aria-hidden />
    </header>
  );
}
