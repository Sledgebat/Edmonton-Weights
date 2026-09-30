/**
 * Viewer preferences stored on <html> as data attributes (so CSS can react before React hydrates)
 * and remembered in localStorage.
 *   data-era      dynasty | copper | gear
 *   data-mode     light | dark
 *   data-spoilers on | off
 */
import { DEFAULT_ERA, ERAS, type Era, type Mode } from "./tokens";

export const PREF_KEYS = { era: "och-era", mode: "och-mode", spoilers: "och-spoilers" } as const;
export type Spoilers = "on" | "off";

/**
 * Runs inline in <head> before first paint, so there is no flash of the wrong theme.
 * Kept dependency-free and wrapped in try/catch (storage can throw in private windows).
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,s=window.localStorage;
var eras=${JSON.stringify(ERAS)};
var e=s.getItem("${PREF_KEYS.era}");if(eras.indexOf(e)<0)e="${DEFAULT_ERA}";
var m=s.getItem("${PREF_KEYS.mode}");if(m!=="light"&&m!=="dark")m=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";
var p=s.getItem("${PREF_KEYS.spoilers}")==="on"?"on":"off";
d.setAttribute("data-era",e);d.setAttribute("data-mode",m);d.setAttribute("data-spoilers",p);
}catch(_){var d2=document.documentElement;d2.setAttribute("data-era","${DEFAULT_ERA}");d2.setAttribute("data-mode","light");d2.setAttribute("data-spoilers","off");}})();`;

function save(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice still applies for this page view */
  }
}

export function setEra(era: Era) {
  document.documentElement.setAttribute("data-era", era);
  save(PREF_KEYS.era, era);
}

export function setMode(mode: Mode) {
  document.documentElement.setAttribute("data-mode", mode);
  save(PREF_KEYS.mode, mode);
}

export function setSpoilers(value: Spoilers) {
  document.documentElement.setAttribute("data-spoilers", value);
  save(PREF_KEYS.spoilers, value);
}
