import { expect, test, type Page } from "@playwright/test";

async function prepareMusic(
  page: Page,
  mode: "blocked" | "autoplay" | "unavailable" = "blocked",
  storageBlocked = false,
) {
  await page.route("**/v1/**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.addInitScript(
    ({ mode, storageBlocked }) => {
      if (storageBlocked) {
        Storage.prototype.getItem = () => {
          throw new DOMException("Storage blocked", "SecurityError");
        };
        Storage.prototype.setItem = () => {
          throw new DOMException("Storage blocked", "SecurityError");
        };
      }
      const playback = new WeakMap<HTMLMediaElement, boolean>();
      let attempts = 0;
      Object.defineProperty(HTMLMediaElement.prototype, "paused", {
        get() {
          return !playback.get(this);
        },
      });
      HTMLMediaElement.prototype.play = function () {
        attempts++;
        document.documentElement.dataset.musicAttempts = String(attempts);
        if (mode === "unavailable")
          return Promise.reject(
            new DOMException("Cannot decode", "NotSupportedError"),
          );
        if (mode === "blocked" && attempts === 1)
          return Promise.reject(
            new DOMException("Interaction required", "NotAllowedError"),
          );
        playback.set(this, true);
        return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause = function () {
        playback.set(this, false);
        this.dispatchEvent(new Event("pause"));
      };
    },
    { mode, storageBlocked },
  );
}

test("blocked autoplay starts after a page interaction and music can be muted", async ({
  page,
}) => {
  await prepareMusic(page);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Adopt", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-music-attempts", "2");
});

test("the music button starts blocked audio once, supports keyboard use, and remembers mute", async ({
  page,
}) => {
  await prepareMusic(page);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("html")).toHaveAttribute("data-music-attempts", "2");
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-music-attempts");
});

test("allowed autoplay is reflected in the control and mute works without browser storage", async ({
  page,
}) => {
  await prepareMusic(page, "autoplay", true);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("unavailable audio stays off and can be retried without disrupting reception", async ({
  page,
}) => {
  await prepareMusic(page, "unavailable");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  await expect(page.locator("#music-status")).toContainText("unavailable");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.locator("html")).toHaveAttribute("data-music-attempts", "2");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(page.locator("#surrender-panel")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the music control remains reachable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await prepareMusic(page);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  const bounds = await toggle.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

test("the shipped recording is playable after a user gesture", async ({ page }) => {
  await page.route("**/v1/**", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Farm music", exact: true });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#music-status")).toBeEmpty();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});
