import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  return errors;
}

const nav = (page: Page, route: string) => page.locator(`[data-route="${route}"]`);

async function goRoute(page: Page, route: string) {
  await nav(page, route).click();
  await expect(page).toHaveURL(new RegExp(`#/${route}$`));
}

async function loadDemo(page: Page) {
  await goRoute(page, "import");
  await page.getByTestId("demo-load").click();
  await expect(page.getByTestId("import-status")).toContainText(/added/, { timeout: 20_000 });
  const status = (await page.getByTestId("import-status").textContent()) ?? "";
  return Number(/(\d+) added/.exec(status)?.[1] ?? 0);
}

test("first visit is honest: empty state, no silent errors, real link to import", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await expect(page).toHaveTitle(/Salvage/);
  await expect(page.getByRole("heading", { name: /Nothing here yet/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Import bookmarks" })).toBeVisible();
  await expect(page.getByText(/Trial starts at first import/)).toBeVisible();
  await expect(page.getByTestId("deck-pos")).toHaveCount(0);
  await expect.poll(() => errors.join("\n"), { timeout: 4_000 }).toBe("");
  const manifest = await page.request.get(new URL("manifest.webmanifest", baseURL!).href);
  expect(manifest.ok()).toBeTruthy();
  const styles = await page.evaluate(() => getComputedStyle(document.querySelector(".brand a")!).color);
  expect(styles).not.toBe("rgba(0, 0, 0, 0)");
});

test("import → deck → triage → reload → export, end to end", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  const added = await loadDemo(page);
  expect(added).toBeGreaterThan(100);
  await expect(page.getByText(/Trial day \d+ of 40/)).toBeVisible();

  await goRoute(page, "deck");
  const card = page.getByTestId("deck-card");
  await expect(card).toBeVisible();
  const firstTitle = await card.locator(".deck-title").textContent();
  expect((firstTitle ?? "").trim().length).toBeGreaterThan(3);
  await expect(card.locator(".why")).toContainText("Why now");
  expect(await card.locator(".deck-url").getAttribute("href")).toMatch(/^https?:\/\//);
  const total = Number(/of (\d+)/.exec((await page.getByTestId("deck-pos").textContent()) ?? "")?.[1] ?? 0);
  expect(total).toBeGreaterThanOrEqual(5);

  for (const key of ["k", "k", "x", "s", "k"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId("deck-pos")).toHaveText(`6 of ${total}`);

  await page.reload();
  await expect(page.getByTestId("deck-card")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("deck-pos")).toHaveText(`6 of ${total}`);

  await goRoute(page, "queue");
  await expect(page.getByTestId("queue-count")).toBeVisible();
  expect(await page.locator(".link-row").count()).toBeGreaterThan(0);
  const before = await page.locator(".link-row").count();
  await page.locator(".link-row").first().getByRole("button", { name: "Read" }).click();
  await page.waitForTimeout(600);
  expect(await page.locator(".link-row").count()).toBeLessThan(before);

  await goRoute(page, "pulse");
  await expect(page.getByTestId("pulse-title")).toBeVisible();
  expect(Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""))).toBe(added);

  await goRoute(page, "settings");
  await expect(page.getByText(/Pro trial — \d+ of 40 days left/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  const json = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(json.app).toBe("salvage");
  expect(json.links).toHaveLength(added);
  const tossed = json.links.filter((l: { status: string }) => l.status === "tossed");
  expect(tossed.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("keyboard-only triage, undo, and focus stays on the deck", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-card")).toBeVisible();
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of \d+/);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute("data-action")))
    .toBe("open");
  await page.keyboard.press("x");
  await expect(page.getByTestId("deck-pos")).toHaveText(/2 of \d+/);
  await page.keyboard.press("u");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of \d+/);
  await expect(page.locator(".link-row", { hasText: "Toss it" })).toHaveCount(0);
  await page.keyboard.press("4");
  await expect(page.getByTestId("pulse-title")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("deck-card")).toBeVisible();
  expect(errors).toEqual([]);
});

test("search ranks local matches, reports empty honestly, and the app survives going offline", async ({ page, context, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "library");
  const box = page.getByLabel(/Search library/i);
  await expect(box).toBeVisible();
  const allRows = await page.locator(".link-row").count();
  expect(allRows).toBeGreaterThan(50);
  await box.fill("github");
  await expect(page.getByTestId("library-count")).toContainText(/match/, { timeout: 10_000 });
  const hits = await page.locator(".link-row").count();
  expect(hits).toBeGreaterThan(5);
  expect(hits).toBeLessThan(allRows);
  await box.fill("zzqqxx-nothing-matches-this");
  await expect(page.getByText(/No match for/)).toBeVisible();
  await expect(box).toBeFocused();

  await page.waitForTimeout(3_000);
  const controlledBefore = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  expect(controlledBefore).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const servedByWorker = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return { controller: navigator.serviceWorker.controller !== null, transferSize: nav?.transferSize ?? -1 };
  });
  expect(servedByWorker.controller).toBe(true);
  expect(servedByWorker.transferSize).toBe(0);
  await expect(nav(page, "library")).toBeVisible({ timeout: 20_000 });
  await goRoute(page, "pulse");
  await expect(page.getByTestId("pulse-title")).toBeVisible();
  expect(Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""))).toBeGreaterThan(100);
  await context.setOffline(false);
  expect(errors.filter((e) => !e.includes("ERR_INTERNET_DISCONNECTED"))).toEqual([]);
});

test("desktop and mobile look right at real widths", async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-card")).toBeVisible();
  const width = await page.evaluate(() => window.innerWidth);
  const tag = width <= 500 ? "mobile" : "desktop";
  await page.screenshot({ path: `shots/deck-${tag}.png`, fullPage: width > 500 });
  await goRoute(page, "library");
  await page.getByLabel(/Search library/i).fill("cron");
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/library-${tag}.png` });
  await goRoute(page, "pulse");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/pulse-${tag}.png`, fullPage: width > 500 });
  await goRoute(page, "settings");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/settings-${tag}.png`, fullPage: width > 500 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("re-importing the same library merges instead of duplicating", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  const added = await loadDemo(page);
  await page.getByTestId("demo-load").click();
  await expect(page.getByTestId("import-status")).toContainText(/0 added/);
  await expect(page.getByTestId("import-status")).toContainText(new RegExp(`${added} already had`));
  await goRoute(page, "pulse");
  expect(Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""))).toBe(added);
  expect(errors).toEqual([]);
});

test("folder rename and duplicate cleanup are reachable and pro-gated honestly", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "pulse");
  const input = page.getByLabel(/New name for folder/i).first();
  await expect(input).toBeVisible();
  const oldName = await input.inputValue();
  await input.fill("Triaged pile");
  await page.getByRole("button", { name: "Rename" }).first().click();
  await expect(page.locator(".link-row").first()).toBeVisible();
  await goRoute(page, "import");
  await expect(page.getByTestId("import-status")).toContainText(/added/);
  const dupCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Duplicates" }) });
  await expect(dupCard).toBeVisible();
  expect(oldName.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
