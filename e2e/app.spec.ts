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

async function loadDemo(page: Page): Promise<number> {
  await goRoute(page, "import");
  await page.getByTestId("demo-load").click();
  await expect(page.getByTestId("import-status")).toContainText(/added/, { timeout: 20_000 });
  const status = (await page.getByTestId("import-status").textContent()) ?? "";
  return Number(/(\d+) added/.exec(status)?.[1] ?? 0);
}

async function expireTrial(page: Page) {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("salvage", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const t = database.transaction("meta", "readwrite");
      const store = t.objectStore("meta");
      const g = store.get("settings");
      g.onsuccess = () => {
        const row = g.result as { key: string; value: Record<string, unknown> };
        row.value = { ...row.value, firstRunAt: Date.now() - 45 * 86_400_000 };
        store.put(row);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    database.close();
  });
}

const deckTotal = async (page: Page) => Number(/of (\d+)/.exec((await page.getByTestId("deck-pos").textContent()) ?? "")?.[1] ?? 0);

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
  const painted = await page.evaluate(() => getComputedStyle(document.querySelector(".deck, .empty")!).backgroundColor);
  expect(painted).not.toBe("rgba(0, 0, 0, 0)");
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
  const firstTitle = (await card.locator(".deck-title").textContent()) ?? "";
  expect(firstTitle.trim().length).toBeGreaterThan(3);
  await expect(card.locator(".why")).toContainText("Why now");
  expect(await card.locator(".deck-url").getAttribute("href")).toMatch(/^https?:\/\//);
  const total = await deckTotal(page);
  expect(total).toBe(5);

  for (const key of ["k", "x", "s", "k"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(220);
  }
  await expect(page.getByTestId("deck-pos")).toHaveText(`${total} of ${total}`);
  await expect(page.getByTestId("action-feedback")).toContainText(/you can undo/);
  await expect(page.locator(".progress-text")).toContainText("1 tossed");
  await expect(page.locator(".progress-text")).toContainText("1d streak");

  await page.reload();
  await expect(page.getByTestId("deck-card")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("deck-pos")).toHaveText(`${total} of ${total}`);
  await expect(page.locator(".progress-text")).toContainText("1 tossed");

  await goRoute(page, "queue");
  await expect(page.getByTestId("queue-count")).toContainText(/2 waiting/);
  const before = await page.locator(".link-row").count();
  expect(before).toBeGreaterThan(0);
  await page.locator(".link-row").first().getByRole("button", { name: "Read" }).click();
  await expect.poll(() => page.locator(".link-row").count(), { timeout: 8_000 }).toBeLessThan(before);

  await goRoute(page, "pulse");
  await expect(page.getByTestId("pulse-title")).toBeVisible();
  expect(Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""))).toBe(added - 3);

  await goRoute(page, "settings");
  await expect(page.getByText(/Pro trial — \d+ of 40 days left/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  const json = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(json.app).toBe("salvage");
  expect(json.links).toHaveLength(added);
  expect(json.links.filter((l: { status: string }) => l.status === "tossed").length).toBe(1);
  expect(json.links.filter((l: { snoozedUntil: number | null }) => l.snoozedUntil).length).toBe(1);
  expect(errors).toEqual([]);
});

test("keyboard-only triage, visible undo, and focus stays with the card", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-card")).toBeVisible();
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of \d+/);
  await expect.poll(() => page.evaluate(() => document.activeElement?.className ?? "")).toContain("deck-title");
  const firstTitle = await page.locator(".deck-title").textContent();
  await page.keyboard.press("x");
  await expect(page.getByTestId("deck-pos")).toHaveText(/2 of \d+/);
  await page.keyboard.press("u");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of \d+/);
  await expect(page.locator(".deck-title")).toHaveText(firstTitle ?? "");
  await expect(page.getByTestId("action-feedback")).toContainText(/^Undid:/);
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
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const served = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return { controller: navigator.serviceWorker.controller !== null, transferSize: n?.transferSize ?? -1 };
  });
  expect(served.controller).toBe(true);
  expect(served.transferSize).toBe(0);
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
  expect(oldName.length).toBeGreaterThan(0);
  await input.fill("Triaged pile");
  await page.getByRole("button", { name: "Rename" }).first().click();
  await expect(page.getByTestId("folder-list")).toContainText("Triaged pile", { timeout: 10_000 });
  await expect(page.getByTestId("folder-list")).not.toContainText(oldName, { timeout: 10_000 });
  await goRoute(page, "import");
  const dupCard = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Duplicates" }) });
  await expect(dupCard).toBeVisible();
  await expect(dupCard).toContainText(/duplicate|Pro tool|URL/);
  expect(errors).toEqual([]);
});

test("the 40-day clock really changes what the deck may deal", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  await loadDemo(page);
  await goRoute(page, "settings");
  await page.getByLabel("Cards per day").fill("12");
  await page.getByTestId("save-deck").click();
  await expect(page.getByTestId("settings-feedback")).toContainText(/12 cards a day/);
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of 12/);

  // Rewind the trial clock in the database, exactly as day 41 would find it.
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("salvage", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const t = database.transaction("meta", "readwrite");
      const store = t.objectStore("meta");
      const g = store.get("settings");
      g.onsuccess = () => {
        const row = g.result as { key: string; value: Record<string, unknown> };
        row.value = { ...row.value, firstRunAt: Date.now() - 45 * 86_400_000 };
        store.put(row);
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const t = database.transaction("decks", "readonly");
      const r = t.objectStore("decks").getAllKeys();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const t = database.transaction("decks", "readwrite");
      for (const k of keys) t.objectStore("decks").delete(k);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    database.close();
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Trial ended · free plan/)).toBeVisible({ timeout: 15_000 });
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of 5/);
  await goRoute(page, "settings");
  await expect(page.getByText(/soft trial/i)).toBeVisible();
  await expect(page.getByText(/clearing site data resets the clock/i)).toBeVisible();
  await expect(page.getByText(/deck size choice/)).toBeVisible();
  await expect(page.getByText(/· unlimited library/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("a restored export re-joins the same library instead of doubling it", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  const added = await loadDemo(page);
  await goRoute(page, "deck");
  await page.locator("[data-action=toss]").first().click();
  await page.waitForTimeout(400);
  await goRoute(page, "settings");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-json").click()]);
  const file = await dl.path();
  await goRoute(page, "import");
  await page.setInputFiles("#file", file);
  await expect(page.getByTestId("import-status")).toContainText(/0 added/, { timeout: 15_000 });
  await expect(page.getByTestId("import-status")).toContainText(new RegExp(`${added} already had`));
  await goRoute(page, "pulse");
  expect(Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""))).toBe(added - 1);
  expect(errors).toEqual([]);
});

test("an expired plan trims the deck it already cut, without wiping today", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  const added = await loadDemo(page);
  await goRoute(page, "settings");
  await page.getByLabel("Cards per day").fill("12");
  await page.getByTestId("save-deck").click();
  await expect(page.getByTestId("settings-feedback")).toContainText(/12 cards a day/);
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of 12/);

  // Day 41, same calendar day, decks NOT deleted: the cut has to shrink itself.
  await expireTrial(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText(/Trial ended · free plan/)).toBeVisible({ timeout: 15_000 });
  await goRoute(page, "deck");
  await expect(page.getByTestId("deck-pos")).toHaveText(/1 of 5/, { timeout: 15_000 });
  await expect(page.getByTestId("action-feedback")).toContainText(/Free plan deals at most 5 cards/);
  await goRoute(page, "library");
  await expect(page.getByTestId("library-count")).toContainText(new RegExp(String(added)), { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test("two records sharing one id both stay visible", async ({ page, baseURL }) => {
  const errors = watchErrors(page);
  await page.goto(baseURL!);
  const added = await loadDemo(page);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("salvage", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const base = (await new Promise<string[]>((resolve, reject) => {
      const t = database.transaction("links", "readonly");
      const req = t.objectStore("links").getAll();
      req.onsuccess = () => resolve(req.result.map((l: { id: string }) => l.id));
      req.onerror = () => reject(req.error);
    })).filter(Boolean);
    const first = base[0];
    const clone = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const t = database.transaction("links", "readonly");
      const req = t.objectStore("links").get(first);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const colliding = {
      ...clone,
      url: "https://collision.example/twin",
      title: "the twin with a stolen id",
      dedupeKey: "https://collision.example/twin",
      status: "pile",
    };
    await new Promise<void>((resolve, reject) => {
      const t = database.transaction("links", "readwrite");
      t.objectStore("links").put(colliding);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    database.close();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await goRoute(page, "pulse");
  await expect(page.getByTestId("pulse-title")).toBeVisible({ timeout: 15_000 });
  const pile = Number((await page.locator(".stats dd").first().textContent())?.replace(/,/g, ""));
  expect(pile).toBe(added);
  await goRoute(page, "library");
  await page.getByLabel(/Search library/i).fill("collision.example");
  await expect(page.getByTestId("library-count")).toContainText(/1 match/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});
