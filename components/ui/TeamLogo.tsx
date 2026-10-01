"use client";

import { useState } from "react";

/**
 * NHL team logo from the NHL's asset CDN (fine for local prototyping; see LICENSING.md before
 * launch). Shows the light or dark variant to match the theme, and falls back to the team's
 * abbreviation if the image can't load.
 */
export function TeamLogo({
  abbrev,
  logo,
  darkLogo,
  size = 32,
  className = "",
}: {
  abbrev: string;
  logo?: string;
  darkLogo?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dark = darkLogo ?? logo?.replace("_light.svg", "_dark.svg");

  if (!logo || failed) {
    return (
      <span
        aria-hidden
        className={`numeral inline-grid shrink-0 place-items-center rounded-full bg-sunken text-fg-muted ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {abbrev}
      </span>
    );
  }
  /* eslint-disable @next/next/no-img-element -- remote SVG logos; next/image adds nothing here */
  return (
    <span className={`inline-flex shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      <img src={logo} alt="" width={size} height={size} className="logo-light h-full w-full" onError={() => setFailed(true)} loading="lazy" />
      {dark && <img src={dark} alt="" width={size} height={size} className="logo-dark h-full w-full" onError={() => setFailed(true)} loading="lazy" />}
    </span>
  );
  /* eslint-enable @next/next/no-img-element */
}
