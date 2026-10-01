/**
 * Team badge: the team's abbreviation in a circle. The public site doesn't show NHL team
 * logos (they're trademarks; see LICENSING.md). `logo` props are accepted and ignored so
 * callers don't need to change.
 */
export function TeamLogo({
  abbrev,
  size = 32,
  className = "",
}: {
  abbrev: string;
  logo?: string;
  darkLogo?: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`numeral inline-grid shrink-0 place-items-center rounded-full border border-line-strong bg-sunken text-fg ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {abbrev}
    </span>
  );
}
