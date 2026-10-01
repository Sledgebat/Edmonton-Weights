/**
 * Light/dark preference, stored on <html> as data-mode (so CSS applies before React hydrates)
 * and remembered in localStorage.
 */
import type { Mode } from "./tokens";

export const MODE_KEY = "och-mode";

/** Runs inline in <head> before first paint, so there is no flash of the wrong mode. */
export const THEME_BOOT_SCRIPT = `(function(){var d=document.documentElement;try{
var m=window.localStorage.getItem("${MODE_KEY}");
if(m!=="light"&&m!=="dark")m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
d.setAttribute("data-mode",m);
}catch(_){d.setAttribute("data-mode","light");}})();`;

export function setMode(mode: Mode) {
  document.documentElement.setAttribute("data-mode", mode);
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable: the choice still applies for this page view */
  }
}
