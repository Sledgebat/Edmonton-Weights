import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AA_MIN, contrastRatio } from "@/lib/theme/contrast";
import { buildThemesCss } from "@/lib/theme/css";
import { CONTRAST_PAIRS, MODES, THEMES } from "@/lib/theme/tokens";

describe("contrast math", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
    // The plan's warning: orange on white fails for small text.
    expect(contrastRatio("#FF4C00", "#FFFFFF")).toBeLessThan(4.5);
  });
});

describe("theme", () => {
  for (const mode of MODES) {
    it(`${mode}: every required pair passes WCAG AA`, () => {
      const t = THEMES[mode];
      const failures = CONTRAST_PAIRS.filter((p) => contrastRatio(t[p.fg], t[p.bg]) < AA_MIN[p.req]).map(
        (p) => `${p.fg} on ${p.bg}: ${contrastRatio(t[p.fg], t[p.bg]).toFixed(2)}`,
      );
      expect(failures).toEqual([]);
    });
  }

  it("dark mode uses Oilers navy as the page background", () => {
    expect(THEMES.dark.surface).toBe(THEMES.dark["brand-primary"]);
  });

  it("styles/themes.css is up to date (run `npm run themes:build`)", () => {
    const onDisk = readFileSync(path.resolve(__dirname, "../../styles/themes.css"), "utf8");
    expect(onDisk).toBe(buildThemesCss());
  });
});
