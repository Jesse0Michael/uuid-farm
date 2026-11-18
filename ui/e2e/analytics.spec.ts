import { expect, test, type Page } from "@playwright/test";

const id = "123e4567-e89b-12d3-a456-426614174000";
const name = "Buttercup";
const send_to = "G-TEST000001";

function commands(page: Page) {
  return page.evaluate(() => (window.dataLayer ?? []).map(entry => Array.from(entry)));
}

test("records bounded service outcomes and screens without contacting Google in local debug", async ({ page, context }) => {
  const googleRequests: string[] = [];
  await context.route(/googletagmanager|google-analytics/, (route) => {
    googleRequests.push(route.request().url());
    return route.abort();
  });
  await context.grantPermissions(["clipboard-write"]);
  let adoptionCount = 0;
  let surrenderCount = 0;
  await page.route("**/v1/uuids", (route) => adoptionCount++ === 0
    ? route.fulfill({ status: 404 })
    : route.fulfill({ json: { id, name } }));
  await page.route(`**/v1/uuids/${id}/history`, (route) => route.fulfill({ json: { items: [] } }));
  await page.route(`**/v1/uuids/${id}`, (route) => surrenderCount++ === 0
    ? route.fulfill({ status: 409 })
    : route.fulfill({ status: 201, json: { id, name } }));

  await page.goto(`/?q=${id}`, { referer: `https://example.org/records/${id}` });
  await page.locator("#adopt-tab").click();
  await page.locator("#adopt-form button").click();
  await expect(page.locator("#adopt-status")).toContainText("Everyone has found a home");
  await page.locator("#adopt-form button").click();
  await expect(page.locator("#adopted-id")).toHaveText(id);
  await page.locator("#copy-id").click();
  await expect(page.locator("#copy-id")).toContainText("Copied");
  await page.locator("#surrender-tab").click();
  await page.locator("#surrender-id").fill(id);
  await page.locator("#surrender-form button").click();
  await expect(page.locator("#surrender-status")).toContainText("already in our care");
  await page.locator("#surrender-form button").click();
  await expect(page.locator("#surrender-status")).toContainText("Welcome to the farm");
  await page.locator("#docs-tab").click();
  await expect(page.locator("#docs-view")).toBeVisible();
  await page.getByRole("link", { name: "Back to the farm" }).click();
  await expect(page.locator("#surrender-panel")).toBeVisible();

  const queue = await commands(page);
  expect(queue[1]).toEqual(["config", send_to, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: new URL(page.url()).origin + "/",
    page_referrer: "https://example.org",
  }]);
  expect(queue.slice(2)).toEqual([
    ["event", "screen_opened", { screen_name: "adopt", send_to }],
    ["event", "service_requested", { service: "adopt", send_to }],
    ["event", "service_failed", { service: "adopt", failure_reason: "none_available", send_to }],
    ["event", "service_requested", { service: "adopt", send_to }],
    ["event", "adoption_completed", { send_to }],
    ["event", "uuid_copied", { send_to }],
    ["event", "screen_opened", { screen_name: "surrender", send_to }],
    ["event", "service_requested", { service: "surrender", send_to }],
    ["event", "service_failed", { service: "surrender", failure_reason: "already_available", send_to }],
    ["event", "service_requested", { service: "surrender", send_to }],
    ["event", "surrender_completed", { send_to }],
    ["event", "screen_opened", { screen_name: "documentation", send_to }],
    ["event", "screen_opened", { screen_name: "surrender", send_to }],
  ]);
  expect(JSON.stringify(queue)).not.toContain(id);
  expect(JSON.stringify(queue)).not.toContain(name);
  expect(googleRequests).toEqual([]);
});
