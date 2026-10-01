"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, House, ListOrdered, Users, type LucideIcon } from "lucide-react";
import { NAV, isActive } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/schedule": CalendarDays,
  "/players": Users,
  "/standings": ListOrdered,
  "/stats-guide": BookOpen,
};

/** Phone and small-tablet navigation, pinned to the bottom of the screen. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-raised pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {NAV.map((item) => {
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
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
