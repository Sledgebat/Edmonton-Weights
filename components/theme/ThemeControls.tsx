"use client";

import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { setEra, setMode, setSpoilers, type Spoilers } from "@/lib/theme/prefs";
import { DEFAULT_ERA, ERAS, ERA_INFO, type Era, type Mode } from "@/lib/theme/tokens";
import { useHtmlAttr } from "./use-html-attr";

/** A tiny jersey: body colour with a sleeve stripe of the accent and trim. */
function JerseySwatch({ era }: { era: Era }) {
  const [body, accent, trim] = ERA_INFO[era].swatch;
  return (
    <svg viewBox="0 0 28 24" width="28" height="24" aria-hidden="true">
      <path
        d="M9 1 L2 5 L0 12 L5 13 L6 9 L6 23 L22 23 L22 9 L23 13 L28 12 L26 5 L19 1 Q14 5 9 1 Z"
        fill={body}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1"
      />
      <rect x="6" y="15" width="16" height="2.6" fill={accent} />
      <rect x="6" y="17.6" width="16" height="1.6" fill={trim} />
      <rect x="6" y="19.2" width="16" height="2.6" fill={accent} />
    </svg>
  );
}

export function EraPicker() {
  const era = useHtmlAttr<Era>("data-era", DEFAULT_ERA);
  return (
    <div role="radiogroup" aria-label="Jersey era theme" className="flex items-center sm:gap-1">
      {ERAS.map((e) => {
        const selected = e === era;
        return (
          <button
            key={e}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${ERA_INFO[e].name} theme (${ERA_INFO[e].years})`}
            title={`${ERA_INFO[e].name} · ${ERA_INFO[e].years}`}
            onClick={() => setEra(e)}
            className={`grid h-8 w-8 place-items-center rounded-md transition sm:h-9 sm:w-9 ${
              selected ? "bg-white/15 ring-2 ring-header-accent" : "opacity-75 hover:bg-white/10 hover:opacity-100"
            }`}
          >
            <JerseySwatch era={e} />
          </button>
        );
      })}
    </div>
  );
}

export function ModeToggle() {
  const mode = useHtmlAttr<Mode>("data-mode", "light");
  const next: Mode = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid h-8 w-8 place-items-center rounded-md hover:bg-white/10 sm:h-9 sm:w-9"
    >
      {mode === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}

export function SpoilerToggle() {
  const spoilers = useHtmlAttr<Spoilers>("data-spoilers", "off");
  const on = spoilers === "on";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setSpoilers(on ? "off" : "on")}
      title={on ? "Spoiler-free mode is on: scores are hidden" : "Hide scores and results"}
      className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-md px-1.5 sm:h-9 xl:px-2 text-xs font-semibold uppercase tracking-wide ${
        on ? "bg-header-accent/20 ring-2 ring-header-accent" : "hover:bg-white/10"
      }`}
    >
      {on ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
      <span className="sr-only whitespace-nowrap xl:not-sr-only">Spoiler-free</span>
    </button>
  );
}
