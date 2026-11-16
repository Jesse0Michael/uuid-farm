import { expect, test, type Page } from "@playwright/test";

const id = "123e4567-e89b-42d3-a456-426614174000";
const secondID = "223e4567-e89b-42d3-a456-426614174000";
const resident = {
  id,
  name: "Mabel",
  surrenderDate: "2026-11-14T12:00:00Z",
  adoptionDate: "2026-11-15T12:00:00Z",
};
const events = [
  { id: "00000000000000000004", type: "adopted", date: "2026-11-15T12:00:00Z" },
  { id: "00000000000000000003", type: "surrendered", date: "2026-11-14T12:00:00Z" },
  { id: "00000000000000000002", type: "adopted", date: "2025-06-16T12:00:00Z" },
  { id: "00000000000000000001", type: "surrendered", date: "2025-06-15T12:00:00Z" },
];

async function mockReception(page: Page) {
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/v1/uuids")
      return route.fulfill({ json: resident });
    return route.fulfill({ status: 404, json: { code: 404, message: "Not found" } });
  });
}

test("the adoption story checks for earlier visits after adoption and pages through them on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockReception(page);
  const requests: string[] = [];
  await page.route("**/v1/uuids/*/history*", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor") ?? "";
    requests.push(cursor);
    return route.fulfill({ json: cursor
      ? { items: events.slice(2) }
      : { items: events.slice(0, 2), nextCursor: events[1].id },
    });
  });
  await page.goto("/");
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adoption-record")).toBeVisible();
  const story = page.locator("#resident-history");
  await expect(story).toBeVisible();
  expect(requests).toEqual([""]);
  await story.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(story.locator("li")).toHaveCount(2);
  await expect(story.locator("li span")).toHaveText(["Found a home", "Welcomed to the farm"]);
  await expect(story.locator("time").first()).toHaveAttribute("datetime", events[0].date);
  await story.getByRole("button", { name: "Earlier chapters" }).click();
  await expect(story.locator("li")).toHaveCount(4);
  await expect(story.getByRole("button")).toBeHidden();
  expect(requests).toEqual(["", events[1].id]);
  await story.locator("summary").click();
  await story.locator("summary").click();
  expect(requests).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

for (const count of [0, 1, 2]) {
  test(`history stays hidden when only ${count} current-visit events are recorded`, async ({ page }) => {
    await mockReception(page);
    await page.route("**/v1/uuids/*/history*", (route) =>
      route.fulfill({ json: { items: events.slice(0, count) } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
    const story = page.locator("#resident-history");
    await expect(story.getByRole("status", { includeHidden: true })).toContainText(
      count ? "Most recent first" : "No earlier chapters",
    );
    await expect(story).toBeHidden();
    await expect(page.locator("#record-surrendered")).toContainText("2026");
    await expect(page.locator("#record-adopted")).toContainText("2026");
    await expect(page.locator("#adopted-id")).toHaveText(id);
  });
}

test("an unavailable history stays hidden without losing a successful adoption", async ({ page }) => {
  await mockReception(page);
  await page.route("**/v1/uuids/*/history*", (route) =>
    route.fulfill({ status: 503, body: "Unavailable" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const story = page.locator("#resident-history");
  await expect(story.getByRole("status", { includeHidden: true })).toContainText("unavailable");
  await expect(story).toBeHidden();
  await expect(page.locator("#adopted-id")).toHaveText(id);
  await expect(page.locator("#adopt-status")).toContainText("It’s official");
});

test("history can be retried without losing a successful adoption or earlier pages", async ({ page }) => {
  await mockReception(page);
  let calls = 0;
  await page.route("**/v1/uuids/*/history*", async (route) => {
    calls++;
    if (calls === 1) return route.fulfill({ json: { items: events.slice(0, 2), nextCursor: events[1].id } });
    if (calls === 2) return route.fulfill({ status: 503, body: "Unavailable" });
    expect(new URL(route.request().url()).searchParams.get("cursor")).toBe(events[1].id);
    return route.fulfill({ json: { items: events.slice(2) } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const story = page.locator("#resident-history");
  await story.locator("summary").click();
  await expect(story.locator("li")).toHaveCount(2);
  await story.getByRole("button", { name: "Earlier chapters" }).click();
  await expect(story.getByRole("status")).toContainText("unavailable");
  await expect(page.locator("#adopted-id")).toHaveText(id);
  await expect(story.locator("li")).toHaveCount(2);
  await story.getByRole("button", { name: "Try their records again" }).click();
  await expect(story.locator("li")).toHaveCount(4);
});

test("a late history response cannot replace another resident's story", async ({ page }) => {
  await mockReception(page);
  let adoptions = 0;
  await page.route("**/v1/uuids", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    adoptions++;
    return route.fulfill({ json: { ...resident, id: adoptions === 1 ? id : secondID } });
  });
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/v1/uuids/*/history*", async (route) => {
    if (route.request().url().includes(id)) {
      await hold;
      await route.fulfill({ json: { items: events } }).catch(() => {});
      finish();
      return;
    }
    return route.fulfill({ json: { items: [events[0]] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const story = page.locator("#resident-history");
  await expect(story.getByRole("status", { includeHidden: true })).toContainText("Opening");
  await expect(story).toBeHidden();
  await page.getByRole("button", { name: "Make room for another" }).click();
  await expect(page.locator("#adopted-id")).toHaveText(secondID);
  await expect(story).not.toHaveAttribute("open", "");
  await expect(story.locator("li")).toHaveCount(1);
  release();
  await finished;
  await expect(story.locator("li")).toHaveCount(1);
  await expect(story).toBeHidden();
});

test("adopting a new resident hides the previous resident's expanded history", async ({ page }) => {
  await mockReception(page);
  let adoptions = 0;
  await page.route("**/v1/uuids", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    adoptions++;
    return route.fulfill({ json: { ...resident, id: adoptions === 1 ? id : secondID } });
  });
  await page.route("**/v1/uuids/*/history*", (route) =>
    route.fulfill({ json: { items: route.request().url().includes(id) ? events : events.slice(0, 2) } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const story = page.locator("#resident-history");
  await story.locator("summary").click();
  await expect(story.locator("li")).toHaveCount(4);
  await page.getByRole("button", { name: "Make room for another" }).click();
  await expect(page.locator("#adopted-id")).toHaveText(secondID);
  await expect(story.locator("li")).toHaveCount(2);
  await expect(story).toBeHidden();
  await expect(story).not.toHaveAttribute("open", "");
});

test("returning and readopting a resident updates its story and leaves decorative creatures alone", async ({ page }) => {
  let available = true;
  let cycle = 0;
  const listRequests: string[] = [];
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/v1/uuids") {
      listRequests.push(request.url());
      return route.fulfill({ json: { items: [] } });
    }
    if (request.method() === "POST" && path === "/v1/uuids") {
      expect(available).toBe(true);
      available = false;
      cycle++;
      return route.fulfill({ json: cycle === 1
        ? { ...resident, surrenderDate: events[3].date, adoptionDate: events[2].date }
        : resident,
      });
    }
    if (request.method() === "POST" && path === `/v1/uuids/${id}`) {
      expect(available).toBe(false);
      available = true;
      return route.fulfill({ status: 201, json: { ...resident, adoptionDate: "" } });
    }
    if (path.endsWith("/history")) return route.fulfill({ json: { items: cycle === 1 ? events.slice(2) : events } });
    return route.fulfill({ status: 404 });
  });
  await page.goto("/");
  const creatures = page.locator(".uuid-creature");
  await expect(creatures).toHaveCount(4);
  const readIDs = () => creatures.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLElement).dataset.uuid),
  );
  const ids = await readIDs();
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adopted-id")).toHaveText(id);
  await expect(page.locator("#resident-history li")).toHaveCount(2);
  await expect(page.locator("#resident-history")).toBeHidden();
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await page.getByLabel("UUID TO SURRENDER", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Surrender a UUID", exact: true }).click();
  await expect(page.locator("#surrender-status")).toContainText("Welcome to the farm");
  await page.getByRole("button", { name: "Adopt", exact: true }).click();
  await expect(page.locator("#adoption-record")).toBeHidden();
  expect(await readIDs()).toEqual(ids);
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  expect(await readIDs()).toEqual(ids);
  await page.locator("#resident-history summary").click();
  await expect(page.locator("#resident-history li")).toHaveCount(4);
  expect(cycle).toBe(2);
  expect(listRequests).toEqual([]);
});
