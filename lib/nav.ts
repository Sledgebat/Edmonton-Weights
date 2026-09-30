export type NavItem = { href: string; label: string; short?: string; phase: number };

/** Main sections, in bottom-nav order on phones. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", phase: 4 },
  { href: "/schedule", label: "Schedule", phase: 4 },
  { href: "/standings", label: "Standings", phase: 4 },
  { href: "/roster", label: "Roster", phase: 4 },
];

/** Everything else (the "More" sheet on phones). */
export const SECONDARY_NAV: NavItem[] = [
  { href: "/playoff-odds", label: "Playoff Odds", short: "Odds", phase: 6 },
  { href: "/milestones", label: "Milestones", phase: 6 },
  { href: "/on-this-day", label: "On This Day", phase: 7 },
  { href: "/blog", label: "Blog", phase: 8 },
];

export const ALL_NAV = [...PRIMARY_NAV, ...SECONDARY_NAV];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
