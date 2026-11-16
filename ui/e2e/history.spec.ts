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
    if (request.method() === "GET" && path === "/v1/uuids")
      return route.fulfill({ json: { items: [] } });
    if (request.method() === "POST" && path === "/v1/uuids")
      return route.fulfill({ json: resident });
    return route.fulfill({ status: 404, json: { code: 404, message: "Not found" } });
  });
}

test("the adoption story loads on request and pages through earlier chapters on a narrow screen", async ({ page }) => {
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
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adoption-record")).toBeVisible();
  expect(requests).toEqual([]);
  const story = page.locator("#resident-history");
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
  await page.route("**/v1/uuids/*/history*", async (route) => {
    if (route.request().url().includes(id)) {
      await hold;
      return route.fulfill({ json: { items: events } }).catch(() => {});
    }
    return route.fulfill({ json: { items: [events[0]] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const story = page.locator("#resident-history");
  await story.locator("summary").click();
  await expect(story.getByRole("status")).toContainText("Opening");
  await page.getByRole("button", { name: "Make room for another" }).click();
  await expect(page.locator("#adopted-id")).toHaveText(secondID);
  await expect(story).not.toHaveAttribute("open", "");
  release();
  await story.locator("summary").click();
  await expect(story.locator("li")).toHaveCount(1);
  await expect(story.getByRole("status")).toContainText("Most recent first");
});

test("returning an adopted resident restores its creature even when the initial list arrives late", async ({ page }) => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let available = true;
  let cycle = 0;
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/v1/uuids") {
      await hold;
      return route.fulfill({ json: { items: [] } });
    }
    if (request.method() === "POST" && path === "/v1/uuids") {
      expect(available).toBe(true);
      available = false;
      cycle++;
      return route.fulfill({ json: resident });
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
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adopted-id")).toHaveText(id);
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await page.getByLabel("UUID TO SURRENDER", { exact: true }).fill(id);
  await page.getByRole("button", { name: "Surrender a UUID", exact: true }).click();
  await expect(page.locator("#surrender-status")).toContainText("Welcome to the farm");
  release();
  await page.getByRole("button", { name: "Adopt", exact: true }).click();
  await expect(page.locator("#adoption-record")).toBeHidden();
  await expect(page.locator(`.uuid-creature[data-uuid="${id}"]`)).toHaveCount(1);
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator(`.uuid-creature[data-uuid="${id}"]`)).toHaveCount(0);
  await page.locator("#resident-history summary").click();
  await expect(page.locator("#resident-history li")).toHaveCount(4);
  expect(cycle).toBe(2);
});
