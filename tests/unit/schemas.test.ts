import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { schemaForPath } from "@/lib/nhl/resources";

const ROOT = path.resolve(__dirname, "../../fixtures/v1");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".json") ? [p] : [];
  });
}

const files = walk(ROOT);

describe("every captured fixture parses with its Zod schema", () => {
  it("has fixtures to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const apiPath = "/" + path.relative(ROOT, file).replace(/\\/g, "/").replace(/\.json$/, "");
    it(apiPath, () => {
      const schema = schemaForPath(apiPath);
      expect(schema, `no schema registered for ${apiPath}`).toBeDefined();
      const result = schema!.safeParse(JSON.parse(readFileSync(file, "utf8")));
      if (!result.success) {
        throw new Error(result.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
      }
    });
  }
});
