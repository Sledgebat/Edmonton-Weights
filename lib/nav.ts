export type NavItem = { href: string; label: string };

/** Main sections, in bottom-nav order on phones. */
export const NAV: NavItem[] = [
  { href: "/", label: "Home" },
  { href: "/schedule", label: "Games" },
  { href: "/roster", label: "Players" },
  { href: "/standings", label: "Standings" },
];

/** Behind-the-scenes pages, linked from the footer only. */
export const FOOTER_EXTRAS: NavItem[] = [
  { href: "/data", label: "Data status" },
  { href: "/styleguide", label: "Style guide" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // Player and game pages belong to Players and Games.
  if (href === "/roster" && pathname.startsWith("/player/")) return true;
  if (href === "/schedule" && pathname.startsWith("/game/")) return true;
  return pathname === href || pathname.startsWith(href + "/");
}
