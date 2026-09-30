"use client";

import { useEffect } from "react";

/** In spoiler-free mode, tapping (or pressing Enter on) a blurred `.spoiler` element reveals it. */
export function SpoilerRevealer() {
  useEffect(() => {
    const reveal = (target: EventTarget | null) => {
      if (document.documentElement.dataset.spoilers !== "on") return false;
      const el = (target as HTMLElement | null)?.closest?.(".spoiler");
      if (!el || el.hasAttribute("data-revealed")) return false;
      el.setAttribute("data-revealed", "");
      return true;
    };
    const onClick = (e: MouseEvent) => {
      if (reveal(e.target)) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && reveal(e.target)) e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return null;
}
