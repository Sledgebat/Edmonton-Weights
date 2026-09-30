import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/schedule",
  "/standings",
  "/roster",
  "/playoff-odds",
  "/milestones",
  "/on-this-day",
  "/blog",
  "/styleguide",
  "/data",
];
const ERAS = ["dynasty", "copper", "gear"] as const;
const DISCLAIMER = "Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.";

for (const era of ERAS) {
  test.describe(`${era} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((e) => window.localStorage.setItem("och-era", e), era);
    });

    for (const route of ROUTES) {
      test(`${route} loads cleanly`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
        page.on("pageerror", (err) => errors.push(err.message));

        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-era", era);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByText(DISCLAIMER)).toBeVisible();

        // No horizontal page scroll at any width.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
        expect(errors).toEqual([]);
      });
    }
  });
}

test("theme, mode and spoiler choices persist across reloads", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");

  await page.getByRole("radio", { name: /Copper & Blue/ }).click();
  await expect(html).toHaveAttribute("data-era", "copper");

  const before = await html.getAttribute("data-mode");
  await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).click();
  const after = before === "dark" ? "light" : "dark";
  await expect(html).toHaveAttribute("data-mode", after);

  await page.getByRole("button", { name: /Spoiler-free/ }).click();
  await expect(html).toHaveAttribute("data-spoilers", "on");

  await page.reload();
  await expect(html).toHaveAttribute("data-era", "copper");
  await expect(html).toHaveAttribute("data-mode", after);
  await expect(html).toHaveAttribute("data-spoilers", "on");
  await expect(page.getByRole("radio", { name: /Copper & Blue/ })).toHaveAttribute("aria-checked", "true");
});

test("API routes return validated data with a last-updated stamp", async ({ request }) => {
  for (const route of ["/api/standings", "/api/schedule", "/api/score", "/api/roster", "/api/club-stats", "/api/player/8478402"]) {
    const res = await request.get(route);
    expect(res.status(), route).toBe(200);
    const body = await res.json();
    expect(body.data, route).toBeTruthy();
    expect(body.meta.source, route).toBe("fixture");
    expect(body.meta.fetchedAt, route).toBeGreaterThan(0);
  }
  const bad = await request.get("/api/game/123");
  expect(bad.status()).toBe(400);
});
