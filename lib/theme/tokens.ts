/**
 * Jersey-era theme tokens: the single source of truth for colour.
 * `npm run themes:build` turns this file into styles/themes.css, and
 * tests/unit/themes.test.ts checks every pair in CONTRAST_PAIRS against WCAG AA.
 *
 * Official Oilers blue and orange are sourced; heritage shades (Copper & Blue, Gear)
 * are approximations to verify against high-resolution jersey photos before launch.
 */
import type { Requirement } from "./contrast";

export const ERAS = ["dynasty", "copper", "gear"] as const;
export type Era = (typeof ERAS)[number];
export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];
export const DEFAULT_ERA: Era = "dynasty";

export const ERA_INFO: Record<Era, { name: string; years: string; blurb: string; swatch: [string, string, string] }> = {
  dynasty: {
    name: "Dynasty",
    years: "1979–96 & today",
    blurb: "Orange and blue: all five Cups and the current identity.",
    swatch: ["#041E42", "#FF4C00", "#FFFFFF"],
  },
  copper: {
    name: "Copper & Blue",
    years: "1996–2011",
    blurb: "Midnight blue, copper and red trim: the 2006 run.",
    swatch: ["#0B1D3A", "#B8672E", "#C8102E"],
  },
  gear: {
    name: "Gear",
    years: "2001–07 alternate",
    blurb: "Navy with metallic silver.",
    swatch: ["#041E42", "#A2AAAD", "#53565A"],
  },
};

/** Every colour role a component may use. Each becomes a `--name` CSS variable. */
export type Tokens = {
  /** Brand colours (fills, not necessarily text-safe). */
  "brand-primary": string;
  "brand-accent": string;
  "brand-trim": string;
  /** Page and component surfaces. */
  surface: string;
  "surface-raised": string;
  "surface-sunken": string;
  border: string;
  /** Borders that must be seen (inputs, toggles): 3:1 against surfaces. */
  "border-strong": string;
  /** Text. */
  text: string;
  "text-muted": string;
  /** Accent colour that is safe as small text / links on `surface` and `surface-raised`. */
  "accent-ink": string;
  /** Header / brand bar. */
  "header-bg": string;
  "header-text": string;
  "header-accent": string;
  /** Primary button (accent fill). */
  "button-bg": string;
  "button-text": string;
  /** Sleeve stripes: outer, inner, and the band they sit on. */
  "stripe-outer": string;
  "stripe-inner": string;
  "stripe-band": string;
  /** Results. */
  win: string;
  loss: string;
};

const dynastyLight: Tokens = {
  "brand-primary": "#041E42",
  "brand-accent": "#FF4C00",
  "brand-trim": "#FFFFFF",
  surface: "#F4F6FA",
  "surface-raised": "#FFFFFF",
  "surface-sunken": "#E7ECF3",
  border: "#C9D1DE",
  "border-strong": "#7B879C",
  text: "#041E42",
  "text-muted": "#4A5872",
  "accent-ink": "#B83500",
  "header-bg": "#041E42",
  "header-text": "#FFFFFF",
  "header-accent": "#FF4C00",
  "button-bg": "#FF4C00",
  "button-text": "#041E42",
  "stripe-outer": "#FF4C00",
  "stripe-inner": "#FFFFFF",
  "stripe-band": "#041E42",
  win: "#0F7A3D",
  loss: "#B42318",
};

const dynastyDark: Tokens = {
  ...dynastyLight,
  surface: "#041E42",
  "surface-raised": "#0B2A57",
  "surface-sunken": "#021431",
  border: "#23406E",
  "border-strong": "#6F86AD",
  text: "#F2F5FA",
  "text-muted": "#A8B6CD",
  "accent-ink": "#FF6A2B",
  "header-bg": "#021431",
  "button-bg": "#FF4C00",
  "button-text": "#021431",
  win: "#4ADE80",
  loss: "#FF8A80",
};

const copperLight: Tokens = {
  "brand-primary": "#0B1D3A",
  "brand-accent": "#B8672E",
  "brand-trim": "#C8102E",
  surface: "#F6F4F1",
  "surface-raised": "#FFFFFF",
  "surface-sunken": "#ECE7E1",
  border: "#D6CEC4",
  "border-strong": "#8C8174",
  text: "#0B1D3A",
  "text-muted": "#54596A",
  "accent-ink": "#8F4A1C",
  "header-bg": "#0B1D3A",
  "header-text": "#FFFFFF",
  "header-accent": "#D08045",
  "button-bg": "#8F4A1C",
  "button-text": "#FFFFFF",
  "stripe-outer": "#B8672E",
  "stripe-inner": "#C8102E",
  "stripe-band": "#0B1D3A",
  win: "#0F7A3D",
  loss: "#B42318",
};

const copperDark: Tokens = {
  ...copperLight,
  surface: "#0B1D3A",
  "surface-raised": "#152B4F",
  "surface-sunken": "#06122A",
  border: "#2A4068",
  "border-strong": "#6E82A6",
  text: "#F4F1EC",
  "text-muted": "#B4B8C4",
  "accent-ink": "#E0955C",
  "header-bg": "#06122A",
  "header-accent": "#D08045",
  "button-bg": "#D08045",
  "button-text": "#06122A",
  win: "#4ADE80",
  loss: "#FF8A80",
};

const gearLight: Tokens = {
  "brand-primary": "#041E42",
  "brand-accent": "#A2AAAD",
  "brand-trim": "#53565A",
  surface: "#F3F4F5",
  "surface-raised": "#FFFFFF",
  "surface-sunken": "#E4E6E8",
  border: "#C4C8CC",
  "border-strong": "#83898E",
  text: "#041E42",
  "text-muted": "#53565A",
  "accent-ink": "#3F4347",
  "header-bg": "#041E42",
  "header-text": "#FFFFFF",
  "header-accent": "#C8CCCE",
  "button-bg": "#041E42",
  "button-text": "#FFFFFF",
  "stripe-outer": "#A2AAAD",
  "stripe-inner": "#FFFFFF",
  "stripe-band": "#041E42",
  win: "#0F7A3D",
  loss: "#B42318",
};

const gearDark: Tokens = {
  ...gearLight,
  surface: "#041E42",
  "surface-raised": "#0E2A52",
  "surface-sunken": "#021431",
  border: "#2B4468",
  "border-strong": "#7189AA",
  text: "#F1F3F5",
  "text-muted": "#AEB5BA",
  "accent-ink": "#C8CCCE",
  "header-bg": "#021431",
  "button-bg": "#C8CCCE",
  "button-text": "#041E42",
  win: "#4ADE80",
  loss: "#FF8A80",
};

export const THEMES: Record<Era, Record<Mode, Tokens>> = {
  dynasty: { light: dynastyLight, dark: dynastyDark },
  copper: { light: copperLight, dark: copperDark },
  gear: { light: gearLight, dark: gearDark },
};

/** Text/background pairs that must pass WCAG AA, and at which level. */
export const CONTRAST_PAIRS: { fg: keyof Tokens; bg: keyof Tokens; req: Requirement; use: string }[] = [
  { fg: "text", bg: "surface", req: "text", use: "Body text" },
  { fg: "text", bg: "surface-raised", req: "text", use: "Card text" },
  { fg: "text", bg: "surface-sunken", req: "text", use: "Table stripe text" },
  { fg: "text-muted", bg: "surface", req: "text", use: "Secondary text" },
  { fg: "text-muted", bg: "surface-raised", req: "text", use: "Secondary text on cards" },
  { fg: "accent-ink", bg: "surface", req: "text", use: "Links and accent text" },
  { fg: "accent-ink", bg: "surface-raised", req: "text", use: "Links on cards" },
  { fg: "header-text", bg: "header-bg", req: "text", use: "Header and nav" },
  { fg: "header-accent", bg: "header-bg", req: "ui", use: "Active nav indicator" },
  { fg: "button-text", bg: "button-bg", req: "text", use: "Primary button" },
  { fg: "win", bg: "surface-raised", req: "text", use: "Win label" },
  { fg: "loss", bg: "surface-raised", req: "text", use: "Loss label" },
  { fg: "border-strong", bg: "surface", req: "ui", use: "Input and toggle borders" },
  { fg: "border-strong", bg: "surface-raised", req: "ui", use: "Input borders on cards" },
];

/** Metallic silver, faked with a gradient (headers and badges only, never body text). */
export const METAL_GRADIENT = "linear-gradient(135deg, #C8CCCE 0%, #EEF0F1 45%, #8A9093 100%)";
