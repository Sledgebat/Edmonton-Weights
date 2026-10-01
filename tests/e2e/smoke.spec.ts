import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/schedule",
  "/standings",
  "/roster",
  "/styleguide",
  "/data",
  "/player/8478402",
  "/player/8475883",
  "/game/2026020004",
];
const MODES = ["light", "dark"] as const;
// Tests run offline: stand in for NHL logos and headshots with a blank image.
test.beforeEach(async ({ page }) => {
  await page.route(/assets\.nhle\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  );
});

const DISCLAIMER = "Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.";

for (const mode of MODES) {
  test.describe(`${mode} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((m) => window.localStorage.setItem("och-mode", m), mode);
    });

    for (const route of ROUTES) {
      test(`${route} loads cleanly`, async ({ page }) => {
        const errors: string[] = [];
        page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
        page.on("pageerror", (err) => errors.push(err.message));

        await page.goto(route);
        await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
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

test("light/dark choice persists across reloads", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const before = await html.getAttribute("data-mode");
  const after = before === "dark" ? "light" : "dark";
  await page.getByRole("button", { name: /Switch to (light|dark) mode/ }).click();
  await expect(html).toHaveAttribute("data-mode", after);
  await page.reload();
  await expect(html).toHaveAttribute("data-mode", after);
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

test.describe("pages", () => {
  test("standings highlight the Oilers and draw the wild card line", async ({ page }) => {
    await page.goto("/standings?view=wildcard");
    const oilers = page.locator('tr[aria-current="true"]');
    await expect(oilers.first()).toContainText(/EDM|Oilers/);
    await expect(page.getByText("Playoff line: two wild cards per conference").first()).toBeVisible();
  });

  test("every roster player links to a player page", async ({ page }) => {
    await page.goto("/roster");
    await expect(page.getByRole("heading", { name: "Goalies" })).toBeVisible(); // past the loading skeleton
    const links = page.locator('main a[href^="/player/"]');
    expect(await links.count()).toBeGreaterThanOrEqual(20);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
      expect(href).toMatch(/^\/player\/\d{7}$/);
    }
  });

  test("player pages handle skaters and goalies", async ({ page }) => {
    await page.goto("/player/8478402");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("McDavid");
    await expect(page.getByText("Points, last 10 games")).toBeVisible();

    await page.goto("/player/8475883");
    await expect(page.getByText("Save percentage, last 10 games")).toBeVisible();
    await expect(page.locator("abbr[title='Save percentage']").first()).toBeVisible();
  });

  test("home modules all show a last-updated stamp", async ({ page }) => {
    await page.goto("/");
    expect(await page.locator("time[datetime]").count()).toBeGreaterThanOrEqual(5);
  });
});
