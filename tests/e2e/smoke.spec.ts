import { expect, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/schedule",
  "/standings",
  "/roster",
  "/players",
  "/stats-guide",
  "/game/2026020015",
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

test("advanced stats engine: league table API and data page", async ({ page, request }) => {
  const res = await request.get("/api/stats/teams");
  expect(res.status()).toBe(200);
  const body = await res.json();
  const edm = body.teams.find((t: { abbrev: string }) => t.abbrev === "EDM");
  expect(edm.gp).toBeGreaterThanOrEqual(1);
  expect(edm.metrics.cfPct).toBeGreaterThan(0);
  expect(edm.ranks.xgfPct).toBeGreaterThanOrEqual(1);

  await page.goto("/data");
  await expect(page.getByRole("heading", { name: "Advanced stats engine" })).toBeVisible();
  await expect(page.locator("table").filter({ hasText: "xGF%" }).getByText("EDM")).toBeVisible();
});

test("home page shows every section, with the pre-game breakdown folded away", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Next game", "Last game", "Team stats at a glance", "Recent performance", "Leaders", "NHL EDGE tracking"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: /^Oilers \d{4}-\d{2}$/ })).toBeVisible();
  // The breakdown starts closed and opens from the button beside "Game page".
  const toggle = page.getByRole("button", { name: /Pre-game breakdown/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Tale of the tape")).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Tale of the tape")).toBeVisible();
  await expect(page.getByText("Pace of play")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Goalie matchup" })).toBeVisible();
  // Last game links to its report.
  await expect(page.getByRole("link", { name: /Full game report/ })).toHaveAttribute("href", "/game/2026020004");
});

test("game report shows the analysis for a finished game", async ({ page }) => {
  await page.goto("/game/2026020004");
  await expect(page.getByText(/Canucks beat the Oilers 6–5 in overtime/)).toBeVisible();
  for (const title of ["Team comparison", "Expected goals through the game", "Shot map", "By strength", "Goaltending", "Most dangerous shooters", "Three stars", "Scoring"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.locator('svg[aria-label^="Shot map"] circle title').first()).toBeAttached();
  await expect(page.locator("svg[aria-label^='Shot map'] circle")).not.toHaveCount(0);
});

test("game report for an upcoming game explains when it fills in", async ({ page }) => {
  await page.goto("/game/2026020015");
  await expect(page.getByRole("heading", { name: "Report coming at puck drop" })).toBeVisible();
});

test("players table sorts by column", async ({ page }) => {
  await page.goto("/players?season=this");
  const table = page.locator("table").first();
  await expect(table.locator("tbody tr").first()).toContainText("Evan Bouchard"); // most points
  await table.getByRole("button", { name: "ixG", exact: true }).click();
  await expect(table.locator("tbody tr").first()).toContainText("Vasily Podkolzin"); // most individual xG
  await table.getByRole("button", { name: "ixG", exact: true }).click();
  await expect(table.locator("thead th").nth(9)).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByRole("link", { name: "Roster cards" })).toBeVisible();
});

test("player pages show NHL EDGE and model numbers", async ({ page }) => {
  await page.goto("/player/8478402");
  await expect(page.getByRole("heading", { name: /NHL EDGE tracking/ })).toBeVisible();
  await expect(page.getByText("Top skating speed")).toBeVisible();
  await page.goto("/player/8475883");
  await expect(page.getByText("Save % on high-danger shots")).toBeVisible();
});

test("stats guide explains the model with holdout results", async ({ page }) => {
  await page.goto("/stats-guide");
  await expect(page.getByRole("heading", { name: "How well it works" })).toBeVisible();
  await expect(page.getByText("0.754")).toBeVisible();
  await expect(page.locator("#gsax")).toContainText("Goals saved above expected");
  await expect(page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Guide" })).toBeVisible();
});

test("EDGE tiles open a ranked list of every Oilers skater", async ({ page }) => {
  await page.goto("/");
  const edge = page.locator("section[aria-labelledby=edge]");
  const tile = edge.getByRole("button", { name: /Top skating speed/ });
  await expect(tile).toHaveAttribute("aria-expanded", "false");
  await tile.click();
  await expect(tile).toHaveAttribute("aria-expanded", "true");
  const list = edge.getByRole("heading", { name: "Top skating speed", level: 3 });
  await expect(list).toBeVisible();
  await expect(edge.locator("ol li a[href^='/player/']").first()).toBeVisible();
  await tile.click();
  await expect(list).toBeHidden();
});
