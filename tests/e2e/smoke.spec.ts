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
  "/player/8478402",
  "/player/8475883",
  "/game/2026020004",
];
const ERAS = ["dynasty", "copper", "gear"] as const;
// Tests run offline: stand in for NHL logos and headshots with a blank image.
test.beforeEach(async ({ page }) => {
  await page.route(/assets\.nhle\.com/, (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }),
  );
});

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

test.describe("core pages", () => {
  test("spoiler-free mode hides every score on the schedule, and a tap reveals one", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("och-spoilers", "on"));
    await page.goto("/schedule");
    const results = page.locator("ol .spoiler");
    const count = await results.count();
    expect(count).toBeGreaterThan(0); // the fixtures include finished preseason and regular-season games
    for (let i = 0; i < count; i++) {
      expect(await results.nth(i).evaluate((el) => getComputedStyle(el).filter)).toContain("blur");
    }
    const first = results.first();
    await first.click();
    await expect(first).toHaveAttribute("data-revealed", "");
    expect(await first.evaluate((el) => getComputedStyle(el).filter)).toBe("none");
  });

  test("spoiler-free mode blurs the home page's last result and streak", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("och-spoilers", "on"));
    await page.goto("/");
    const blurred = page.locator(".spoiler");
    expect(await blurred.count()).toBeGreaterThan(3);
    expect(await blurred.first().evaluate((el) => getComputedStyle(el).filter)).toContain("blur");
    // Toggling off shows everything again.
    await page.getByRole("button", { name: /Spoiler-free/ }).click();
    expect(await blurred.first().evaluate((el) => getComputedStyle(el).filter)).toBe("none");
  });

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
