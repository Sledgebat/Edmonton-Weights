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
  "/team/EDM",
  "/team/VAN",
  "/clutch",
  "/shooting",
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

test("site is fully static: views switch in the browser and the address remembers them", async ({ page }) => {
  await page.goto("/standings/");
  await page.getByRole("button", { name: "Wild card" }).click();
  await expect(page).toHaveURL(/\?view=wildcard/);
  await expect(page.getByText("Playoff line: two wild cards per conference").first()).toBeVisible();
  await page.goto("/schedule/?show=preseason");
  await expect(page.getByRole("button", { name: "Preseason" })).toHaveAttribute("aria-pressed", "true");
});

test("playoff odds: home snapshot, team page and the Playoff race view, green above 50% and red below", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Playoff odds", { exact: true }).first()).toBeVisible();
  await page.goto("/standings?view=race");
  await expect(page.getByRole("heading", { name: "Oilers' playoff odds this season" })).toBeVisible();
  const cells = page.locator("table td span.numeral");
  await expect(cells).toHaveCount(32);
  for (const cell of await cells.all()) {
    const n = Number((await cell.textContent())!.replace(/[^0-9]/g, ""));
    const cls = (await cell.getAttribute("class")) ?? "";
    if (n > 50) expect(cls).toContain("text-win");
    else if (n < 50) expect(cls).toContain("text-loss");
  }
  await page.goto("/team/EDM");
  await expect(page.getByText("Playoff odds", { exact: true })).toBeVisible();
});

test("Team stats view lists every team, sorts by any stat and marks the Oilers", async ({ page }) => {
  await page.goto("/standings?view=stats");
  const table = page.getByRole("table", { name: /Team stats for every NHL team/ });
  await expect(table.locator("tbody tr")).toHaveCount(32);
  await expect(table.locator("tbody th.shadow-\\[inset_4px_0_0_var\\(--chart-us\\)\\]")).toHaveCount(1);
  await expect(table.locator("tbody th.shadow-\\[inset_4px_0_0_var\\(--chart-us\\)\\]")).toContainText("Oilers");
  // Lower is better for goals against, so the first click puts the stingiest team on top.
  await table.getByRole("button", { name: "GA/G", exact: true }).click();
  const ga = (await table.locator("tbody tr td:nth-child(10)").allTextContents()).filter((t) => t !== "—").map(Number);
  expect(ga).toEqual([...ga].sort((a, b) => a - b));
  await table.locator("tbody tr").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/team\/[A-Z]{3}\/?$/);
});

test("shooting vs career: home box links to the full list, and picking a player charts his career", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Shooting vs career" })).toBeVisible();
  await page.getByRole("link", { name: /Every Oilers shooter/ }).click();
  await expect(page).toHaveURL(/\/shooting\/?$/);
  const rows = page.locator("table tbody tr");
  await expect(rows).not.toHaveCount(0);
  const second = rows.nth(1).getByRole("button");
  const name = (await second.textContent())!.trim();
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  await expect(page).toHaveURL(/player=\d{7}/);
  await expect(page.locator(".career-chart circle").first()).toBeAttached();
});

test.describe("pages", () => {
  test("standings team names open that team's scouting page", async ({ page }) => {
    await page.goto("/standings");
    await page.locator('tr[aria-current="true"] a').first().click();
    await expect(page).toHaveURL(/\/team\/EDM\/?$/);
    await expect(page.getByText("Oilers at a glance").first()).toBeVisible();
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
      expect(href).toMatch(/^\/player\/\d{7}\/?$/);
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

test("data page shows the stats engine and the last update", async ({ page }) => {
  await page.goto("/data");
  await expect(page.getByRole("heading", { name: "Advanced stats engine" })).toBeVisible();
  await expect(page.getByText("Last update")).toBeVisible();
  await expect(page.locator("table").filter({ hasText: "xGF%" }).getByText("EDM")).toBeVisible();
});

test("home page shows every section, with the pre-game breakdown folded away", async ({ page }) => {
  await page.goto("/");
  for (const name of ["Next game", "Last game", "Recent performance", "Team stats at a glance", "Leaders", "NHL EDGE tracking"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  // Recent performance comes before the team stats.
  const order = await page.locator("h2").allTextContents();
  expect(order.indexOf("Recent performance")).toBeLessThan(order.indexOf("Team stats at a glance"));
  // Top game scores link to the game report; leaders include goals, assists and Game Score.
  const top = page.locator("section", { has: page.getByRole("heading", { name: "Top game scores, last 5 games" }) });
  await expect(top.locator('a[href*="/game/2026020004"]').first()).toBeVisible();
  for (const name of ["Goals", "Assists", "Game Score"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
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
  await expect(page.getByRole("link", { name: /Full game report/ })).toHaveAttribute("href", /\/game\/2026020004\/?$/);
});

test("game report shows the analysis for a finished game", async ({ page }) => {
  await page.goto("/game/2026020004");
  await expect(page.getByText(/Canucks beat the Oilers 6–5 in overtime/)).toBeVisible();
  for (const title of ["Team comparison", "Expected goals through the game", "Shot map", "By strength", "Goaltending", "Player ratings", "Lines used tonight", "Three stars", "Scoring"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  // Bouchard's hat trick is the best rating of the night.
  const ratings = page.locator("section", { has: page.getByRole("heading", { name: "Player ratings" }) });
  await expect(ratings.locator("tbody tr").first()).toContainText("Evan Bouchard");
  // Oilers rows are marked, and the filter shows one team at a time.
  const all = await ratings.locator("tbody tr").count();
  await ratings.getByRole("button", { name: "Oilers", exact: true }).click();
  const ours = await ratings.locator("tbody tr").count();
  expect(ours).toBeGreaterThan(10);
  expect(ours).toBeLessThan(all);
  for (const row of await ratings.locator("tbody tr").all()) await expect(row).toContainText("EDM");
  await expect(page.locator('svg[aria-label^="Shot map"] circle title').first()).toBeAttached();
  await expect(page.locator("svg[aria-label^='Shot map'] circle")).not.toHaveCount(0);
});

test("game report for an upcoming game explains when it fills in", async ({ page }) => {
  await page.goto("/game/2026020015");
  await expect(page.getByRole("heading", { name: "Report coming at puck drop" })).toBeVisible();
});

test("players table sorts by column", async ({ page }) => {
  await page.goto("/players?season=this");
  const table = page.locator("table:visible").first();
  await expect(table.locator("tbody tr").first()).toContainText("Evan Bouchard"); // most points
  await page.getByRole("button", { name: "Advanced", exact: true }).first().click();
  const advanced = page.locator("table:visible").first();
  await expect(advanced.locator("tbody tr").first()).toContainText("Vasily Podkolzin"); // most individual xG
  await advanced.getByRole("button", { name: "ixG", exact: true }).click();
  await expect(advanced.locator("thead th").nth(3)).toHaveAttribute("aria-sort", "ascending");
});

test("players stats come in Scoring, Advanced and Physical tabs, with GP in each", async ({ page }) => {
  await page.goto("/players");
  const header = () => page.locator("table:visible").first().locator("thead");
  await expect(header()).toContainText("P1");
  await page.getByRole("button", { name: "Physical & discipline", exact: true }).first().click();
  await expect(page).toHaveURL(/stat=physical/);
  for (const col of ["GP", "FO%", "HIT", "GV", "TK"]) await expect(header()).toContainText(col);
  // Goalies get quality starts and stolen games.
  await expect(page.locator("table:visible").nth(1).locator("thead")).toContainText("QS%");
});

test("standings show regulation wins, goals and home/road records", async ({ page }) => {
  await page.goto("/standings");
  const head = page.locator("table").first().locator("thead");
  for (const col of ["RW", "GF", "GA", "Home", "Road"]) await expect(head).toContainText(col);
});

test("players page has Lines and Roster tabs", async ({ page }) => {
  await page.goto("/players");
  await page.getByRole("button", { name: "Lines", exact: true }).click();
  await expect(page).toHaveURL(/\?tab=lines/);
  await expect(page.getByRole("heading", { name: "Current lines" })).toBeVisible();
  const current = page.locator("section", { has: page.getByRole("heading", { name: "Current lines" }) });
  await expect(current.getByRole("link", { name: "McDavid" })).toBeVisible();
  await page.getByRole("button", { name: "Roster", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Defence" })).toBeVisible();
});

test("player pages show NHL EDGE and model numbers", async ({ page }) => {
  await page.goto("/player/8478402");
  await expect(page.getByRole("heading", { name: /NHL EDGE tracking/ })).toBeVisible();
  await expect(page.getByText("Top skating speed")).toBeVisible();
  await expect(page.getByRole("heading", { name: "On-ice impact" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Most common linemates" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rating, last 10 games" })).toBeVisible();
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
