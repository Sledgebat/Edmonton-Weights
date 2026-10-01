/**
 * Theme tokens: the single source of truth for colour. One theme, Oilers blue and orange,
 * in light and dark. `npm run themes:build` turns this file into styles/themes.css, and
 * tests/unit/themes.test.ts checks every pair in CONTRAST_PAIRS against WCAG AA.
 *
 * Official Oilers colours: navy #041E42, orange #FF4C00 (teamcolorcodes.com).
 */
import type { Requirement } from "./contrast";

export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

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
  /** Charts: Oilers vs opponent (validated for colour-blind separation on the surface). */
  "chart-us": string;
  "chart-them": string;
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
  "chart-us": "#D9480F",
  "chart-them": "#2F6DB5",
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
  "chart-us": "#EE6326",
  "chart-them": "#5E95D6",
};

export const THEMES: Record<Mode, Tokens> = { light: dynastyLight, dark: dynastyDark };

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
  { fg: "chart-us", bg: "surface-raised", req: "ui", use: "Chart: Oilers marks" },
  { fg: "chart-them", bg: "surface-raised", req: "ui", use: "Chart: opponent marks" },
];

