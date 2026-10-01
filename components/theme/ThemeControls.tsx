"use client";

import { Moon, Sun } from "lucide-react";
import { setMode } from "@/lib/theme/prefs";
import type { Mode } from "@/lib/theme/tokens";
import { useHtmlAttr } from "./use-html-attr";

export function ModeToggle() {
  const mode = useHtmlAttr<Mode>("data-mode", "light");
  const next: Mode = mode === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10"
    >
      {mode === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
