import { expect, test, type Page } from "@playwright/test";

const resident = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "Mabel",
  surrenderDate: "2026-11-14T12:00:00Z",
  adoptionDate: "2026-11-15T12:00:00Z",
};

async function mockReception(page: Page) {
  const requests: { method: string; path: string }[] = [];
  await page.route("**/v1/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ method: request.method(), path });
    if (request.method() === "POST" && path === "/v1/uuids")
      return route.fulfill({ json: resident });
    return route.fulfill({ status: 404, json: { code: 404, message: "Not found" } });
  });
  return requests;
}

test("documentation loads on demand and browser navigation preserves reception", async ({ page }) => {
  const requests = await mockReception(page);
  let referenceRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/reference/index.html") referenceRequests++;
  });
  await page.goto("/");
  await expect(page.locator("#docs-view")).toBeHidden();
  expect(referenceRequests).toBe(0);
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adopted-id")).toHaveText(resident.id);
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await page.getByLabel("UUID TO SURRENDER", { exact: true }).fill(resident.id);

  const docs = page.getByRole("link", { name: "Documentation", exact: true });
  await expect(docs).toHaveText("Documentation");
  await docs.click();
  await expect(page).toHaveURL(/#docs$/);
  await expect(page.locator("#docs-view")).toBeVisible();
  await expect(page.locator("#farm-view")).toBeHidden();
  await expect(page.locator("#docs-view")).toBeFocused();
  await expect(page.frameLocator("#api-reference").getByRole("heading", { name: /^UUID Farm \(/ })).toBeVisible();
  expect(referenceRequests).toBe(1);

  await page.goBack();
  await expect(page.locator("#docs-view")).toBeHidden();
  await expect(page.locator("#surrender-panel")).toBeVisible();
  await expect(page.getByLabel("UUID TO SURRENDER", { exact: true })).toHaveValue(resident.id);
  await page.getByRole("button", { name: "Adopt", exact: true }).click();
  await expect(page.locator("#adopted-id")).toHaveText(resident.id);
  await page.goForward();
  await expect(page.locator("#docs-view")).toBeVisible();
  expect(referenceRequests).toBe(1);
  expect(requests).toEqual([{ method: "POST", path: "/v1/uuids" }]);
});

test("a direct documentation link renders the reference and supports its navigation", async ({ page }) => {
  const requests = await mockReception(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#docs");
  await expect(page.locator("#docs-view")).toBeVisible();
  await expect(page.locator("#farm-view")).toBeHidden();
  const reference = page.frameLocator("#api-reference");
  await expect(reference.getByRole("heading", { name: /^UUID Farm \(/ })).toBeVisible();
  const spec = await page.request.get("/reference/openapi.yaml");
  expect(spec.ok()).toBeTruthy();
  expect(await spec.text()).toContain("openapi: 3.0.3");
  await expect(reference.getByRole("button", { name: "Search API documentation" })).toContainText("Search");
  for (const summary of [
    "Get UUID statistics",
    "Adopt a UUID",
    "Get UUID history",
  ]) {
    await reference.getByRole("link", { name: new RegExp(`^${summary} (get|post)$`) }).click();
    await expect(reference.getByRole("heading", { name: new RegExp(`${summary}$`) })).toBeVisible();
  }
  await page.getByRole("link", { name: /Back to the farm/ }).click();
  await expect(page.locator("#farm-view")).toBeVisible();
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test("an unavailable reference can be reopened without leaving documentation", async ({ page }) => {
  const requests = await mockReception(page);
  let unavailable = true;
  await page.route("**/reference/index.html", (route) =>
    unavailable
      ? route.fulfill({ status: 503, contentType: "text/plain", body: "Unavailable" })
      : route.continue(),
  );
  await page.goto("/#docs");
  await expect(page.locator("#reference-error")).toBeVisible();
  await expect(page.getByRole("link", { name: /Back to the farm/ })).toBeVisible();
  unavailable = false;
  await page.locator("#reference-retry").click();
  await expect(page.frameLocator("#api-reference").getByRole("heading", { name: /^UUID Farm \(/ })).toBeVisible();
  await expect(page.locator("#reference-error")).toBeHidden();
  expect(requests).toEqual([]);
});

test("a shared history chapter opens directly and survives a reload", async ({ page }) => {
  const requests = await mockReception(page);
  await page.goto("/#docs/operation/getUUIDHistory");
  const reference = page.frameLocator("#api-reference");
  const heading = reference.getByRole("heading", { name: /Get UUID history$/ });
  await expect(page.locator("#docs-view")).toBeVisible();
  await expect(heading).toBeVisible();
  await page.reload();
  await expect(heading).toBeVisible();
  expect(requests).toEqual([]);
});

test("chapter navigation keeps the static server's canonical directory URL without reloading", async ({ page }) => {
  const requests = await mockReception(page);
  const documents: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.resourceType() === "document" && path.startsWith("/reference/"))
      documents.push(path);
  });
  // Match Go's http.FileServer redirect rather than Vite's direct index response.
  await page.route("**/reference/index.html", (route) =>
    route.fulfill({ status: 301, headers: { Location: "./" }, body: "" }),
  );
  // Redirected requests bypass Playwright routes; Vite serves the real artifact
  // at the same canonical directory path used by the production static server.
  await page.goto("/#docs/operation/getUUIDHistory");
  const reference = page.frameLocator("#api-reference");
  await expect(reference.getByRole("heading", { name: /Get UUID history$/ })).toBeVisible();
  expect(await page.locator("#api-reference").evaluate((node) =>
    (node as HTMLIFrameElement).contentWindow!.location.pathname,
  )).toBe("/reference/");
  await page.evaluate(() => { location.hash = "docs/operation/adoptUUID"; });
  await expect(reference.getByRole("heading", { name: /Adopt a UUID$/ })).toBeVisible();
  expect(documents).toEqual(["/reference/index.html", "/reference/"]);
  expect(requests).toEqual([]);
});

test("documentation and the sound control fit a narrow screen and support keyboard navigation", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const requests = await mockReception(page);
  await page.goto("/");
  const docs = page.locator("#docs-tab");
  await docs.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#docs-view")).toBeFocused();
  await expect(page.locator("#docs-view")).toBeVisible();
  await page.locator("#api-reference").scrollIntoViewIfNeeded();
  await expect(page.frameLocator("#api-reference").getByRole("heading", { name: /^UUID Farm \(/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await page.locator("#api-reference").evaluate((node) => {
    const frame = node as HTMLIFrameElement;
    return frame.contentDocument!.documentElement.scrollWidth <= frame.contentWindow!.innerWidth;
  })).toBeTruthy();
  const music = page.getByRole("button", { name: "Farm music", exact: true });
  const bounds = await music.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(await page.locator("#docs-view").evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
  await page.getByRole("link", { name: /Back to the farm/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#farm-view")).toBeVisible();
  expect(requests).toEqual([]);
});

test("the same decorative residents visit documentation and keyboard dismissal stays browser-only", async ({ page }) => {
  const requests = await mockReception(page);
  await page.goto("/");
  const creatures = page.locator(".uuid-creature");
  await expect(creatures).toHaveCount(4);
  const ids = await creatures.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.uuid));
  await page.locator("#docs-tab").click();
  await expect(page.locator("#docs-view")).toBeVisible();
  expect(await creatures.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.uuid))).toEqual(ids);
  const companion = page.locator('.uuid-creature[data-perch="card"]').first();
  await expect(companion).toBeVisible();
  await companion.focus();
  await page.keyboard.press("Enter");
  await expect(companion).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(companion).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  for (let step = 0; step < 35; step++) await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");
  await expect(creatures).toHaveCount(3);
  await expect(page.locator("#docs-tab")).toBeFocused();
  await page.getByRole("link", { name: /Back to the farm/ }).click();
  await expect(creatures).toHaveCount(3);
  expect(requests).toEqual([]);
});
