"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Database,
  Ellipsis,
  History,
  House,
  ListOrdered,
  Newspaper,
  Palette,
  Target,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/schedule": CalendarDays,
  "/standings": ListOrdered,
  "/roster": Users,
  "/playoff-odds": TrendingUp,
  "/milestones": Target,
  "/on-this-day": History,
  "/blog": Newspaper,
  "/styleguide": Palette,
  "/data": Database,
};

const MORE = [
  ...SECONDARY_NAV,
  { href: "/styleguide", label: "Style guide", phase: 2 },
  { href: "/data", label: "Data status", phase: 3 },
];

/** Phone and tablet navigation, pinned to the bottom of the screen. */
export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const sheetRef = useRef<HTMLDivElement>(null);
  const moreActive = MORE.some((i) => isActive(pathname, i.href));

  // Close the sheet after navigating (adjusting state during render, not in an effect).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    sheetRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <div
        ref={sheetRef}
        id="more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More sections"
        hidden={!open}
        className="fixed inset-x-0 bottom-16 z-50 mx-3 mb-2 rounded-xl border border-line bg-raised p-2 shadow-2xl lg:hidden"
      >
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <span className="display text-xl">More</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-10 w-10 place-items-center rounded-md hover:bg-sunken"
            aria-label="Close"
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-1">
          {MORE.map((item) => {
            const Icon = ICONS[item.href];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-2 rounded-lg px-3 font-semibold ${
                    active ? "bg-sunken text-accent-ink" : "hover:bg-sunken"
                  }`}
                >
                  <Icon size={18} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
          {PRIMARY_NAV.map((item) => {
            const Icon = ICONS[item.href];
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    active ? "text-accent-ink" : "text-fg-muted"
                  }`}
                >
                  <Icon size={22} aria-hidden strokeWidth={active ? 2.5 : 2} />
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="more-sheet"
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                open || moreActive ? "text-accent-ink" : "text-fg-muted"
              }`}
            >
              <Ellipsis size={22} aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}
