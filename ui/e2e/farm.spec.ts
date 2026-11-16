import { expect, test, type Page } from "@playwright/test";

const resident = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "Mabel",
  tag: "Gentle disposition",
  surrenderDate: "2025-06-15T12:00:00Z",
  adoptionDate: "2026-11-15T12:00:00Z",
};
const alreadyAdopted = "223e4567-e89b-42d3-a456-426614174000";

async function mockFarm(
  page: Page,
  options: { adoptionStatus?: number; offline?: boolean; empty?: boolean } = {},
) {
  const mutations: { method: string; path: string }[] = [];
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== "GET")
      mutations.push({ method: request.method(), path: url.pathname });
    if (options.offline) return route.abort("connectionrefused");
    if (request.method() === "GET" && url.pathname === "/v1/uuids") {
      return route.fulfill({
        json: {
          items: options.empty
            ? []
            : [
                { ...resident, adoptionDate: "" },
                { id: alreadyAdopted, adoptionDate: resident.adoptionDate },
              ],
        },
      });
    }
    if (request.method() === "POST" && url.pathname === "/v1/uuids") {
      const status = options.adoptionStatus ?? 200;
      return route.fulfill({
        status,
        json:
          status === 200
            ? resident
            : { code: status, message: "Shelter unavailable" },
      });
    }
    if (request.method() === "POST" && url.pathname.startsWith("/v1/uuids/")) {
      return route.fulfill({
        status: 201,
        json: {
          id: decodeURIComponent(url.pathname.split("/").at(-1)!),
          surrenderDate: resident.surrenderDate,
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { code: 404, message: "Not found" },
    });
  });
  return mutations;
}

test("Adopt starts with an invitation and reveals a paper record after adoption", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const mutations = await mockFarm(page);
  await page.goto("/");
  await expect(page.locator("#adopt-panel input")).toHaveCount(0);
  await expect(page.locator("#adoption-record")).toBeHidden();
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  const record = page.locator("#adoption-record");
  await expect(record).toBeVisible();
  await expect(record.locator("#adopted-id")).toHaveText(resident.id);
  await expect(record.locator("#record-name")).toHaveText("Mabel");
  await expect(record.locator("#record-version")).toHaveText(
    "UUID · Version 4",
  );
  await expect(record.locator("#record-surrendered")).toContainText("2025");
  await expect(record.locator("#record-adopted")).toContainText("2026");
  await expect(record.locator("#record-tag")).toHaveText("Gentle disposition");
  await expect(record.getByRole("button", { name: /Copy UUID/ })).toBeVisible();
  await expect(page.locator("#record-title")).toBeFocused();
  expect(mutations).toEqual([{ method: "POST", path: "/v1/uuids" }]);
  expect(errors).toEqual([]);
});

test("Surrender sends the trimmed identifier as one encoded URL segment", async ({
  page,
}) => {
  const mutations = await mockFarm(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await page.getByLabel("UUID TO SURRENDER", { exact: true }).fill(" a/b ");
  await page
    .getByRole("button", { name: "Surrender a UUID", exact: true })
    .click();
  await expect(page.locator("#surrender-status")).toContainText(
    "Welcome to the farm",
  );
  await expect(
    page.getByLabel("UUID TO SURRENDER", { exact: true }),
  ).toHaveValue("");
  expect(mutations).toEqual([{ method: "POST", path: "/v1/uuids/a%2Fb" }]);
});

for (const status of [404, 503]) {
  test(`Adoption HTTP ${status} reports the outcome without inventing a certificate`, async ({
    page,
  }) => {
    await mockFarm(page, { adoptionStatus: status, empty: true });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Adopt a UUID", exact: true })
      .click();
    await expect(page.locator("#adopt-status")).toContainText(
      status === 404
        ? "Everyone has found a home"
        : "reception desk is unavailable",
    );
    await expect(page.locator("#adoption-record")).toBeHidden();
    await expect(page.locator("#adopt-intro")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Adopt a UUID", exact: true }),
    ).toBeEnabled();
  });
}

test("Available residents appear as creatures; adopted residents are excluded", async ({
  page,
}) => {
  await mockFarm(page);
  await page.goto("/");
  await expect(
    page.locator(`.uuid-creature[data-uuid="${resident.id}"]`),
  ).toHaveCount(1);
  await expect(
    page.locator(`.uuid-creature[data-uuid="${alreadyAdopted}"]`),
  ).toHaveCount(0);
});

test("Offline API leaves decorative creatures and an honest failure state", async ({
  page,
}) => {
  await mockFarm(page, { offline: true });
  await page.goto("/");
  await expect(page.locator(".uuid-creature").first()).toBeVisible();
  const ids = await page
    .locator(".uuid-creature")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.uuid),
    );
  expect(
    ids.every((id) =>
      /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
        id ?? "",
      ),
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adopt-status")).toContainText(
    "reception desk is unavailable",
  );
  await expect(page.locator("#adoption-record")).toBeHidden();
});

test("Mobile layout fits the viewport and both forms remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockFarm(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Adopt a UUID", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Adopt a UUID", exact: true }).click();
  await expect(page.locator("#adoption-record")).toBeVisible();
  await page.getByRole("button", { name: "Surrender", exact: true }).click();
  await expect(
    page.getByLabel("UUID TO SURRENDER", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Surrender a UUID", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("System reduced motion keeps the sky still and responds to preference changes", async ({
  page,
}) => {
  await mockFarm(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/scene-ready/);
  await expect(
    page.locator("#motion-toggle, #pasture-note, .play-hint"),
  ).toHaveCount(0);
  const cloud = page.locator(".cloud").first();
  await expect(cloud).toBeVisible();
  await expect(cloud).toHaveCSS("animation-name", "none");
  const staysStill = () =>
    cloud.evaluate(async (node) => {
      const before = node.getBoundingClientRect().x;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return node.getBoundingClientRect().x === before;
    });
  expect(await staysStill()).toBeTruthy();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(cloud).toHaveCSS("animation-name", "cloud-drift");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(cloud).toHaveCSS("animation-name", "none");
  expect(await staysStill()).toBeTruthy();
});

for (const direction of ["normal", "reverse"]) {
  test(`Clouds drift ${direction === "normal" ? "right" : "left"} and wrap beyond the viewport`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.addInitScript(
      (value) => {
        Math.random = () => value;
      },
      direction === "normal" ? 0.25 : 0.75,
    );
    await mockFarm(page);
    await page.goto("/");
    await expect(page.locator("body")).toHaveClass(/scene-ready/);
    const clouds = page.locator(".cloud");
    await expect(clouds).toHaveCount(3);
    await expect(clouds.first()).toHaveCSS("animation-direction", direction);
    expect(
      await page.locator(".sun").evaluate((node) => {
        const image = node as HTMLImageElement;
        return image.complete && image.naturalWidth > 0;
      }),
    ).toBeTruthy();

    const paths = await clouds.evaluateAll((nodes) =>
      nodes.map((node) => {
        const animation = node.getAnimations().find(
          (item) =>
            item instanceof CSSAnimation && item.animationName === "cloud-drift",
        );
        if (!animation?.effect) throw new Error("Missing cloud drift animation");
        animation.pause();
        const timing = animation.effect.getTiming();
        const duration = Number(timing.duration);
        const at = (progress: number) => {
          animation.currentTime = Number(timing.delay) + duration * (2 + progress);
          const bounds = node.getBoundingClientRect();
          return { left: bounds.left, right: bounds.right };
        };
        return {
          duration,
          start: at(0),
          quarter: at(0.25),
          middle: at(0.5),
          exit: at(1 - 1e-8),
          wrapped: at(1),
          viewport: window.innerWidth,
        };
      }),
    );
    for (const path of paths) {
      expect(path.duration).toBeGreaterThanOrEqual(60000);
      expect(path.wrapped.left).toBeCloseTo(path.start.left, 1);
      if (direction === "normal") {
        expect(path.start.right).toBeLessThanOrEqual(1);
        expect(path.middle.left).toBeGreaterThan(path.quarter.left);
        expect(path.exit.left).toBeGreaterThanOrEqual(path.viewport - 1);
      } else {
        expect(path.start.left).toBeGreaterThanOrEqual(path.viewport - 1);
        expect(path.middle.left).toBeLessThan(path.quarter.left);
        expect(path.exit.right).toBeLessThanOrEqual(1);
      }
    }
  });
}

test("Keyboard pickup, drop, and dismissal do not mutate shelter records", async ({
  page,
}) => {
  const mutations = await mockFarm(page);
  await page.goto("/");
  const creature = page.locator(`.uuid-creature[data-uuid="${resident.id}"]`);
  await expect(creature).toHaveCount(1);
  await creature.focus();
  await page.keyboard.press("Enter");
  await expect(creature).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(creature).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".creature-announcement")).toContainText(
    "settled on",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await expect(creature).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  for (let step = 0; step < 35; step++)
    await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Enter");
  await expect(creature).toHaveCount(0);
  await expect(page.locator(".creature-announcement")).toContainText(
    "shelter record is unchanged",
  );
  await expect(page.locator("#adopt-tab")).toBeFocused();
  expect(mutations).toEqual([]);
});

test("Pointer dragging lands residents on the fence and card, then dismisses them visually", async ({
  page,
}) => {
  const mutations = await mockFarm(page);
  await page.goto("/");
  const creature = page.locator(`.uuid-creature[data-uuid="${resident.id}"]`);
  await expect(creature).toHaveAttribute("data-perch", "card");
  await expect(creature).toHaveAttribute("data-mode", "walking");

  async function pickUp() {
    // The SVG stroke is the actual pointer target; the button's transparent
    // bounding box intentionally lets interactions with the paper pass through.
    const point = await creature.locator(".creature-hit").evaluate((node) => {
      const path = node as SVGPathElement;
      const midpoint = path.getPointAtLength(path.getTotalLength() / 2);
      const transform = path.getScreenCTM();
      if (!transform) throw new Error("Creature has no screen transform");
      const screen = new DOMPoint(midpoint.x, midpoint.y).matrixTransform(
        transform,
      );
      return { x: screen.x, y: screen.y };
    });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await expect(creature).toHaveAttribute("data-mode", "held");
  }

  const fence = await page.locator("#fence-surface").boundingBox();
  const card = await page.locator(".registrar").boundingBox();
  if (!fence || !card) throw new Error("Missing landing surfaces");

  await pickUp();
  await page.mouse.move(360, fence.y - 60, { steps: 8 });
  await page.mouse.up();
  await expect(creature).toHaveAttribute("data-perch", "fence");
  await expect(creature).toHaveAttribute("data-mode", "walking");

  await pickUp();
  await page.mouse.move(card.x + card.width / 2, card.y - 60, { steps: 8 });
  await page.mouse.up();
  await expect(creature).toHaveAttribute("data-perch", "card");
  await expect(creature).toHaveAttribute("data-mode", "walking");

  await pickUp();
  await page.mouse.move(360, fence.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect(creature).toHaveCount(0);
  await expect(page.locator(".creature-announcement")).toContainText(
    "shelter record is unchanged",
  );
  expect(mutations).toEqual([]);
});

test("UUID groups hinge at their hyphens and vary their actions without changing records", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const start = new Date("2026-11-15T12:00:00Z");
  await page.clock.install({ time: start });
  await page.addInitScript(() => {
    let seed = 78;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  });
  const mutations = await mockFarm(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/scene-ready/);
  await page.clock.pauseAt(new Date(start.getTime() + 60_000));
  await page.clock.runFor(800);

  const creature = page.locator(`.uuid-creature[data-uuid="${resident.id}"]`);
  await expect(creature.locator(".creature-letter--joint")).toHaveText([
    "-", "-", "-", "-",
  ]);
  const letters = await creature.locator(".creature-letter").evaluateAll((nodes) =>
    nodes.map((node) => {
      const transform = (node as SVGTextElement).transform.baseVal.consolidate();
      if (!transform) throw new Error("Missing glyph transform");
      return {
        text: node.textContent,
        x: transform.matrix.e,
        y: transform.matrix.f,
        angle: Math.atan2(transform.matrix.b, transform.matrix.a),
      };
    }),
  );
  expect(letters.map((letter) => letter.text).join("")).toBe(resident.id);
  const hinges = [0, 8, 13, 18, 23, 35];
  for (let group = 0; group < hinges.length - 1; group++) {
    const startIndex = hinges[group];
    const endIndex = hinges[group + 1];
    const a = letters[startIndex];
    const b = letters[endIndex];
    for (let index = startIndex + 1; index < endIndex; index++) {
      const fraction = (index - startIndex) / (endIndex - startIndex);
      expect(letters[index].x).toBeCloseTo(a.x + (b.x - a.x) * fraction, 1);
      expect(letters[index].y).toBeCloseTo(a.y + (b.y - a.y) * fraction, 1);
      expect(letters[index].angle).toBeCloseTo(letters[startIndex + 1].angle, 3);
    }
  }
  expect(
    Math.max(...letters.map((letter) => letter.y)) -
      Math.min(...letters.map((letter) => letter.y)),
  ).toBeGreaterThan(5);

  const actions = new Set<string>();
  for (let sample = 0; sample < 12 && actions.size < 2; sample++) {
    await page.clock.runFor(2000);
    const current = await page.locator(".uuid-creature").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.action!),
    );
    current.forEach((action) => actions.add(action));
  }
  expect(actions.size).toBeGreaterThanOrEqual(2);
  expect(actions.has("inch")).toBeTruthy();
  expect(mutations).toEqual([]);
});

test("System reduced motion freezes creature gestures and resumes them when requested", async ({
  page,
}) => {
  const mutations = await mockFarm(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/scene-ready/);
  const creature = page.locator(`.uuid-creature[data-uuid="${resident.id}"]`);
  const drawing = () => creature.evaluate((node) => node.innerHTML);
  const laterDrawing = () => creature.evaluate(async (node) => {
    for (let frame = 0; frame < 4; frame++)
      await new Promise(requestAnimationFrame);
    return node.innerHTML;
  });
  await expect(creature).toHaveAttribute("data-action", "rest");
  const initial = await drawing();
  expect(await laterDrawing()).toBe(initial);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(creature).toHaveAttribute("data-action", "inch");
  await expect.poll(drawing).not.toBe(initial);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(creature).toHaveAttribute("data-action", "rest");
  const stopped = await drawing();
  expect(await laterDrawing()).toBe(stopped);
  expect(mutations).toEqual([]);
});

test("Normal-motion dragging by an outer hyphen settles the dangling body on each perch", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const mutations = await mockFarm(page);
  await page.goto("/");
  await expect(page.locator("body")).toHaveClass(/scene-ready/);
  await page.evaluate(() => {
    // Finish the scenic entrance so landing surfaces are stationary.
    for (const animation of document.getAnimations()) {
      const timing = animation.effect?.getComputedTiming();
      if (timing && Number.isFinite(Number(timing.endTime))) animation.finish();
    }
  });
  const creature = page.locator(`.uuid-creature[data-uuid="${resident.id}"]`);
  const fence = await page.locator("#fence-surface").boundingBox();
  const card = await page.locator(".registrar").boundingBox();
  if (!fence || !card) throw new Error("Missing landing surfaces");

  for (const destination of [
    { index: 8, x: 360, y: fence.y - 180, perch: "fence" },
    { index: 23, x: card.x + card.width / 2, y: 4, perch: "card" },
  ]) {
    const joint = creature.locator(".creature-letter").nth(destination.index);
    const point = () => joint.evaluate((node) => {
      const transform = (node as SVGTextElement).getScreenCTM();
      if (!transform) throw new Error("Joint has no screen transform");
      return { x: transform.e, y: transform.f };
    });
    const initial = await point();
    await page.mouse.move(initial.x, initial.y);
    await page.mouse.down();
    await expect(creature).toHaveAttribute("data-mode", "held");
    const pickedUp = await point();
    expect(Math.hypot(pickedUp.x - initial.x, pickedUp.y - initial.y)).toBeLessThan(4);
    await page.mouse.move(destination.x, destination.y, { steps: 5 });
    await expect.poll(async () => {
      const current = await point();
      return Math.hypot(current.x - destination.x, current.y - destination.y);
    }).toBeLessThan(2);
    await page.mouse.up();
    await expect(creature).toHaveAttribute("data-mode", "walking");
    await expect(creature).toHaveAttribute("data-perch", destination.perch);
    await expect(creature).toHaveAttribute("aria-pressed", "false");
  }
  expect(mutations).toEqual([]);
});
