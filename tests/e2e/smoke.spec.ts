import { expect, test } from "@playwright/test";

test("home page loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oil Country Hub");
  await expect(page.getByText("Independent fan site. Not affiliated")).toBeVisible();
  expect(errors).toEqual([]);
});
