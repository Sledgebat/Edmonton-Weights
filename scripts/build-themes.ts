/** Regenerates styles/themes.css from lib/theme/tokens.ts. Run: npm run themes:build */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildThemesCss } from "../lib/theme/css";

const file = path.resolve(process.cwd(), "styles/themes.css");
writeFileSync(file, buildThemesCss());
console.log(`Wrote ${path.relative(process.cwd(), file)}`);
