import "./creatures.css";
import {
  JOINT_INDICES,
  createMotion,
  advanceMotion,
  poseMotion,
  type Motion,
} from "./creature-motion.ts";

const SVG = "http://www.w3.org/2000/svg";
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
type Perch = "card" | "fence";
type Mode = "walking" | "held" | "falling";
type Surface = { kind: Perch; left: number; right: number; y: number };
type Creature = {
  id: string;
  pendingID?: string;
  button: HTMLButtonElement;
  letters: SVGTextElement[];
  body: SVGPathElement;
  joints: SVGPathElement;
  hit: SVGPathElement;
  eyes: SVGGElement;
  pupils: SVGCircleElement[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  motion: Motion;
  direction: number;
  perch: Perch;
  mode: Mode;
  grip: number;
  origin: { x: number; y: number; perch: Perch };
  pointer: number | null;
  targetX: number;
  targetY: number;
  lastPointerX: number;
  lastPointerTime: number;
};

export interface CreatureController {
  setResidents(ids: string[]): void;
  addResident(id: string): void;
  removeResident(id: string): void;
  destroy(): void;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, value);
  return node;
}
const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), Math.max(low, high));
const fallbackID = () => crypto.randomUUID();

/** Decorative residents: moving or dismissing them never alters the shelter's records. */
export function createCreatures(): CreatureController {
  const layer = document.getElementById("creature-layer");
  if (!layer) throw new Error("Missing creature-layer");
  const root: HTMLElement = layer;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = media.matches;
  let stopped = false;
  let frame = 0;
  let previous = 0;
  let elapsed = 0;
  let geometryDirty = true;
  let surfaceAnimating = false;
  let scale =
    window.innerWidth < 600 ? 0.7 : window.innerWidth < 1000 ? 0.85 : 1;
  let surfaces: Surface[] = [];
  let cardRect: DOMRect | null = null;
  const creatures: Creature[] = [];
  const dismissed = new Set<string>();
  const events = new AbortController();
  const announcement = document.createElement("span");
  announcement.className = "creature-announcement";
  announcement.setAttribute("role", "status");
  announcement.setAttribute("aria-live", "polite");
  root.append(announcement);

  function schedule() {
    if (!stopped && !document.hidden && frame === 0)
      frame = requestAnimationFrame(tick);
  }
  function measure() {
    scale = window.innerWidth < 600 ? 0.7 : window.innerWidth < 1000 ? 0.85 : 1;
    surfaces = [];
    cardRect = null;
    for (const [selector, kind] of [
      [".registrar", "card"],
      ["#fence-surface", "fence"],
    ] as const) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (kind === "card") cardRect = rect;
      if (rect.width > 0 && rect.height > 0)
        surfaces.push({
          kind,
          left: rect.left,
          right: rect.right,
          y: rect.top,
        });
    }
    geometryDirty = false;
  }
  function surfaceFor(kind: Perch) {
    return surfaces.find((surface) => surface.kind === kind);
  }
  function bounds(surface: Surface): [number, number] {
    const padding = Math.min(118 * scale, (surface.right - surface.left) / 2);
    return [
      Math.max(padding, surface.left + padding),
      Math.min(window.innerWidth - padding, surface.right - padding),
    ];
  }
  function assign(creature: Creature, id: string) {
    creature.id = id;
    creature.button.dataset.uuid = id;
    creature.button.setAttribute(
      "aria-label",
      `UUID ${id}. Press Enter to pick up, arrow keys to move, Enter to release, Escape to return.`,
    );
    creature.letters.forEach((letter, index) => {
      letter.textContent = id[index] || "";
    });
  }
  function create(id: string, index: number) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `uuid-creature uuid-creature--${index % 3}`;
    button.title = "Pick me up. I like the fence and the paperwork.";
    button.setAttribute("aria-pressed", "false");
    const drawing = svg("svg", {
      viewBox: "-130 -75 260 160",
      "aria-hidden": "true",
      focusable: "false",
    });
    const hit = svg("path", { class: "creature-hit" });
    const joints = svg("path", { class: "creature-joint" });
    const body = svg("path", { class: "creature-body" });
    drawing.append(hit, joints, body);
    const letters = Array.from({ length: 36 }, (_, index) => {
      const joint = JOINT_INDICES.some((pivot) => pivot === index);
      const letter = svg("text", {
        "text-anchor": "middle",
        "dominant-baseline": "central",
        class: `creature-letter${joint ? " creature-letter--joint" : ""}`,
      });
      if (joint) letter.dataset.jointIndex = String(index);
      drawing.append(letter);
      return letter;
    });
    const eyes = svg("g", { class: "creature-eyes" });
    const pupils: SVGCircleElement[] = [];
    for (const x of [-2.7, 2.7]) {
      eyes.append(
        svg("circle", { cx: String(x), cy: "0", r: "3.4", fill: "#fffbeb" }),
      );
      const pupil = svg("circle", {
        cx: String(x + 0.65),
        cy: "-0.3",
        r: "1.35",
        fill: "#283e29",
      });
      eyes.append(pupil);
      pupils.push(pupil);
    }
    drawing.append(eyes);
    button.append(drawing);
    root.append(button);
    const perch: Perch = creatures.some(
      (creature) => creature.perch === "card" && creature.mode === "walking",
    )
      ? "fence"
      : "card";
    const surface = surfaceFor(perch);
    const [left, right] = surface
      ? bounds(surface)
      : [120, window.innerWidth - 120];
    const x =
      perch === "card"
        ? left + (right - left) * 0.7
        : left +
          (right - left) * ((index - 1) / Math.max(1, desiredCount() - 2));
    const y = surface ? surface.y - 7 * scale : window.innerHeight * 0.8;
    const creature: Creature = {
      id,
      button,
      body,
      joints,
      hit,
      letters,
      eyes,
      pupils,
      x,
      y,
      vx: 0,
      vy: 0,
      motion: createMotion(),
      direction: index % 2 ? 1 : -1,
      perch,
      mode: "walking",
      grip: 0.5,
      origin: { x, y, perch },
      pointer: null,
      targetX: x,
      targetY: y,
      lastPointerX: x,
      lastPointerTime: 0,
    };
    assign(creature, id);
    button.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.button !== 0 ||
          creatures.some((other) => other !== creature && other.mode === "held")
        )
          return;
        event.preventDefault();
        // Grab the nearest real hinge, including on a curled or raised body.
        const grip = JOINT_INDICES.reduce(
          (nearest, index) => {
            const matrix = creature.letters[index].getScreenCTM();
            if (!matrix) return nearest;
            const distance = Math.hypot(
              event.clientX - matrix.e,
              event.clientY - matrix.f,
            );
            return distance < nearest.distance ? { index, distance } : nearest;
          },
          { index: 18, distance: Infinity },
        );
        pickUp(creature, grip.index);
        creature.pointer = event.pointerId;
        creature.targetX = event.clientX;
        creature.targetY = event.clientY;
        creature.lastPointerX = event.clientX;
        creature.lastPointerTime = event.timeStamp;
        button.setPointerCapture(event.pointerId);
      },
      { signal: events.signal },
    );
    button.addEventListener(
      "pointermove",
      (event) => {
        if (creature.pointer !== event.pointerId || creature.mode !== "held")
          return;
        const delta = Math.max(1, event.timeStamp - creature.lastPointerTime);
        creature.vx = clamp(
          ((event.clientX - creature.lastPointerX) / delta) * 1000,
          -350,
          350,
        );
        creature.targetX = event.clientX;
        creature.targetY = event.clientY;
        creature.lastPointerX = event.clientX;
        creature.lastPointerTime = event.timeStamp;
        schedule();
      },
      { signal: events.signal },
    );
    button.addEventListener(
      "pointerup",
      (event) => {
        if (creature.pointer !== event.pointerId) return;
        creature.x = event.clientX;
        creature.y = event.clientY;
        release(creature);
        if (button.hasPointerCapture(event.pointerId))
          button.releasePointerCapture(event.pointerId);
      },
      { signal: events.signal },
    );
    button.addEventListener("pointercancel", () => restore(creature), {
      signal: events.signal,
    });
    button.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (creature.mode === "held") release(creature);
          else if (!creatures.some((other) => other.mode === "held"))
            pickUp(creature);
        } else if (event.key === "Escape" && creature.mode === "held") {
          event.preventDefault();
          restore(creature);
        } else if (
          creature.mode === "held" &&
          ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
            event.key,
          )
        ) {
          event.preventDefault();
          const distance = event.shiftKey ? 40 : 12;
          creature.targetX +=
            event.key === "ArrowRight"
              ? distance
              : event.key === "ArrowLeft"
                ? -distance
                : 0;
          creature.targetY +=
            event.key === "ArrowDown"
              ? distance
              : event.key === "ArrowUp"
                ? -distance
                : 0;
          creature.targetX = clamp(creature.targetX, 0, window.innerWidth);
          creature.targetY = clamp(
            creature.targetY,
            0,
            window.innerHeight + 50,
          );
          creature.x = creature.targetX;
          creature.y = creature.targetY;
          schedule();
        }
      },
      { signal: events.signal },
    );
    button.addEventListener(
      "blur",
      () => {
        if (creature.mode === "held" && creature.pointer === null)
          restore(creature);
      },
      { signal: events.signal },
    );
    creatures.push(creature);
    paint(creature);
  }

  function pickUp(creature: Creature, joint = 18) {
    const anchor = creature.letters[joint].getScreenCTM();
    creature.origin = { x: creature.x, y: creature.y, perch: creature.perch };
    creature.mode = "held";
    creature.grip = joint / 35;
    // Keep the picked hinge in place as the other sections fold around it.
    if (anchor) {
      creature.x = anchor.e;
      creature.y = anchor.f;
    }
    creature.targetX = creature.x;
    creature.targetY = creature.y;
    creature.vx = 0;
    creature.vy = 0;
    creature.button.classList.add("is-held");
    creature.button.setAttribute("aria-pressed", "true");
    announcement.textContent =
      "Resident picked up. Place them on the fence or the top of the card.";
    schedule();
  }
  function restore(creature: Creature) {
    if (creature.pendingID) {
      assign(creature, creature.pendingID);
      delete creature.pendingID;
    }
    creature.x = creature.origin.x;
    creature.y = creature.origin.y;
    creature.perch = creature.origin.perch;
    creature.mode = "walking";
    creature.pointer = null;
    creature.vx = 0;
    creature.vy = 0;
    creature.button.classList.remove("is-held");
    creature.button.setAttribute("aria-pressed", "false");
    schedule();
  }
  function release(creature: Creature) {
    if (creature.pendingID) {
      assign(creature, creature.pendingID);
      delete creature.pendingID;
    }
    creature.pointer = null;
    creature.mode = "falling";
    creature.vy = 0;
    creature.button.classList.remove("is-held");
    creature.button.setAttribute("aria-pressed", "false");
    if (reduced) settleWithoutMotion(creature);
    schedule();
  }
  function settleWithoutMotion(creature: Creature) {
    const destination = surfaces
      .filter(
        (surface) =>
          creature.y <= surface.y + 2 &&
          creature.x >= surface.left &&
          creature.x <= surface.right,
      )
      .sort((a, b) => a.y - b.y)[0];
    if (destination) land(creature, destination);
    else dismiss(creature);
  }
  function land(creature: Creature, surface: Surface) {
    creature.mode = "walking";
    creature.perch = surface.kind;
    creature.y = surface.y - 7 * scale;
    creature.x = clamp(creature.x, ...bounds(surface));
    creature.vx = 0;
    creature.vy = 0;
    announcement.textContent = `Resident settled on the ${surface.kind === "card" ? "paperwork" : "fence"}.`;
  }
  function dismiss(creature: Creature) {
    dismissed.add(creature.id);
    const focused = document.activeElement === creature.button;
    creature.button.remove();
    const index = creatures.indexOf(creature);
    if (index >= 0) creatures.splice(index, 1);
    if (focused)
      (document.getElementById("adopt-tab") as HTMLElement | null)?.focus();
    announcement.textContent =
      "Resident wandered out of view. Their shelter record is unchanged.";
  }

  function paint(creature: Creature) {
    const { mode, grip } = creature;
    // The foreground paperwork occludes residents walking behind it. Avoid
    // invisible hit targets over copy/submit controls when the paper is tall.
    const halfBody = 118 * scale;
    const occluded =
      mode === "walking" &&
      creature.perch === "fence" &&
      cardRect !== null &&
      creature.y > cardRect.top + 10 &&
      creature.y < cardRect.bottom &&
      creature.x + halfBody > cardRect.left &&
      creature.x - halfBody < cardRect.right;
    creature.button.dataset.occluded = String(occluded);
    creature.button.tabIndex = occluded ? -1 : 0;
    creature.button.setAttribute("aria-hidden", String(occluded));
    if (occluded && document.activeElement === creature.button) {
      document.getElementById("adopt-tab")?.focus({ preventScroll: true });
    }
    const pose = poseMotion(creature.motion, {
      mode,
      direction: creature.direction,
      reduced,
      grip,
      sway: hangingSway(creature),
    });
    creature.letters.forEach((letter, index) => {
      const current = pose.letters[index];
      letter.setAttribute(
        "transform",
        `translate(${current.x.toFixed(2)} ${current.y.toFixed(2)}) rotate(${current.rotation.toFixed(1)})`,
      );
    });
    // The four hyphens are narrow hinges between five rounded, rigid sections.
    // The continuous centerline remains the generous pointer target.
    const path = pose.vertices
      .map(
        (point, index) =>
          `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join(" ");
    const sections = pose.vertices.slice(1).map((end, index) => {
      const start = pose.vertices[index];
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      const dx = (end.x - start.x) / length;
      const dy = (end.y - start.y) / length;
      const insetStart = index === 0 ? 0 : 9;
      const insetEnd = index === 4 ? 0 : 9;
      return `M${(start.x + dx * insetStart).toFixed(1)},${(start.y + dy * insetStart).toFixed(1)} L${(end.x - dx * insetEnd).toFixed(1)},${(end.y - dy * insetEnd).toFixed(1)}`;
    });
    creature.body.setAttribute("d", sections.join(" "));
    creature.joints.setAttribute("d", path);
    creature.hit.setAttribute("d", path);
    creature.button.dataset.perch = creature.perch;
    creature.button.dataset.mode = creature.mode;
    creature.button.dataset.action =
      mode === "walking"
        ? reduced
          ? "rest"
          : creature.motion.action
        : mode;
    creature.button.dataset.direction = String(creature.direction);
    const head = pose.letters[creature.direction > 0 ? 35 : 0];
    creature.eyes.setAttribute(
      "transform",
      `translate(${head.x} ${head.y}) rotate(${head.rotation}) translate(0 -9) scale(1 ${pose.eyeOpen})`,
    );
    creature.pupils.forEach((pupil, index) => {
      pupil.setAttribute(
        "cx",
        String((index ? 2.7 : -2.7) + pose.gaze.x),
      );
      pupil.setAttribute("cy", String(-0.3 + pose.gaze.y));
    });
    creature.button.style.width = `${260 * scale}px`;
    creature.button.style.height = `${160 * scale}px`;
    creature.button.style.transform = `translate3d(${creature.x - 130 * scale}px,${creature.y - 75 * scale}px,0)`;
  }
  function hangingSway(creature: Creature) {
    return creature.mode !== "walking" && !reduced
      ? Math.sin(elapsed * 3) * 7 + clamp(-creature.vx * 0.05, -14, 14)
      : 0;
  }
  function tick(time: number) {
    frame = 0;
    if (stopped || document.hidden) return;
    const dt = Math.min((time - (previous || time)) / 1000, 0.04);
    previous = time;
    elapsed += dt;
    if (
      geometryDirty ||
      surfaceAnimating ||
      elapsed < 5 ||
      creatures.some((creature) => creature.mode !== "walking")
    )
      measure();
    for (const creature of [...creatures]) {
      if (creature.mode === "held") {
        const follow = reduced ? 1 : Math.min(1, dt * 24);
        creature.x += (creature.targetX - creature.x) * follow;
        creature.y += (creature.targetY - creature.y) * follow;
        creature.vx *= Math.exp(-dt * 4);
      } else if (creature.mode === "falling") {
        const prior = creature.y;
        creature.vy += dt * 700;
        creature.x = clamp(
          creature.x + creature.vx * dt * 0.25,
          0,
          window.innerWidth,
        );
        creature.y += creature.vy * dt;
        const pose = poseMotion(creature.motion, {
          mode: "falling",
          direction: creature.direction,
          reduced,
          grip: creature.grip,
          sway: hangingSway(creature),
        });
        const bottom = creature.y +
          Math.max(...pose.vertices.map((point) => point.y)) * scale;
        const landing = surfaces
          .filter(
            (surface) =>
              prior <= surface.y + 2 &&
              bottom >= surface.y &&
              creature.x >= surface.left &&
              creature.x <= surface.right,
          )
          .sort((a, b) => a.y - b.y)[0];
        if (landing) land(creature, landing);
        else if (creature.y > window.innerHeight + 100) {
          dismiss(creature);
          continue;
        }
      } else {
        const surface = surfaceFor(creature.perch);
        if (surface) {
          creature.y = surface.y - 7 * scale;
          const [left, right] = bounds(surface);
          if (!reduced) {
            const { distance } = advanceMotion(creature.motion, dt);
            creature.x += distance * creature.direction * scale;
          }
          if (creature.x <= left) creature.direction = 1;
          else if (creature.x >= right) creature.direction = -1;
          creature.x = clamp(creature.x, left, right);
        }
      }
      paint(creature);
    }
    if (
      (!reduced && (creatures.length > 0 || surfaceAnimating)) ||
      creatures.some((creature) => creature.mode === "falling")
    )
      schedule();
  }
  function desiredCount() {
    return window.innerWidth < 1000 ? 3 : 5;
  }
  function dirty() {
    geometryDirty = true;
    schedule();
  }
  const observer = new ResizeObserver(dirty);
  for (const selector of [".registrar", "#fence-surface"]) {
    const target = document.querySelector(selector);
    if (target) observer.observe(target);
  }
  window.addEventListener(
    "resize",
    () => {
      dirty();
      // Preserve the card resident while avoiding an overcrowded fence after rotation.
      while (creatures.length > desiredCount()) {
        const candidate = creatures.findLast(
          (creature) => creature.mode !== "held" && creature.perch === "fence",
        );
        if (!candidate) break;
        candidate.button.remove();
        creatures.splice(creatures.indexOf(candidate), 1);
      }
    },
    { signal: events.signal },
  );
  window.addEventListener("scroll", dirty, {
    signal: events.signal,
    passive: true,
  });
  media.addEventListener(
    "change",
    () => {
      reduced = media.matches;
      previous = 0;
      if (reduced) {
        measure();
        for (const creature of [...creatures]) {
          if (creature.mode === "falling") settleWithoutMotion(creature);
        }
      }
      schedule();
    },
    { signal: events.signal },
  );
  // Entrance transforms do not trigger ResizeObserver. Follow the actual fence
  // animation, even when asset decoding delayed it beyond the first few seconds.
  document.addEventListener(
    "animationstart",
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.matches(".fence-arrival")
      ) {
        surfaceAnimating = true;
        dirty();
      }
    },
    { capture: true, signal: events.signal },
  );
  for (const name of ["animationend", "animationcancel"])
    document.addEventListener(
      name,
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(".fence-arrival")
        ) {
          surfaceAnimating = false;
          dirty();
        }
      },
      { capture: true, signal: events.signal },
    );
  document.addEventListener(
    "farm:scene-ready",
    () => {
      elapsed = 0;
      dirty();
    },
    { signal: events.signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (!document.hidden) {
        geometryDirty = true;
        schedule();
      }
    },
    { signal: events.signal },
  );
  measure();
  for (let index = 0; index < desiredCount(); index++)
    create(fallbackID(), index);
  schedule();

  return {
    setResidents(ids) {
      const real = [
        ...new Set(ids.filter((id) => UUID.test(id) && !dismissed.has(id))),
      ];
      if (!real.length) return;
      const present = new Set(
        creatures.flatMap((creature) => [creature.id, creature.pendingID]),
      );
      const waiting = real.filter((id) => !present.has(id));
      // Preserve positions and interactions while replacing fallback lettering.
      // A surrender may already have placed a resident before this read finishes.
      for (const creature of creatures) {
        if (
          real.includes(creature.id) ||
          (creature.pendingID && real.includes(creature.pendingID))
        )
          continue;
        const id = waiting.shift();
        if (!id) break;
        if (creature.mode === "held") creature.pendingID = id;
        else assign(creature, id);
      }
      schedule();
    },
    addResident(id) {
      if (
        !UUID.test(id) ||
        creatures.some(
          (creature) => creature.id === id || creature.pendingID === id,
        )
      )
        return;
      dismissed.delete(id);
      if (creatures.length < desiredCount()) create(id, creatures.length);
      else {
        const replace = creatures.find(
          (creature) =>
            creature.mode === "walking" && creature.perch === "fence",
        );
        if (replace) {
          assign(replace, id);
          const card = surfaceFor("card");
          if (card && !creatures.some((creature) => creature.perch === "card"))
            land(replace, card);
        }
      }
      schedule();
    },
    removeResident(id) {
      for (const creature of creatures) {
        if (creature.pendingID === id) delete creature.pendingID;
        if (creature.id === id) assign(creature, fallbackID());
      }
      schedule();
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(frame);
      events.abort();
      observer.disconnect();
      creatures.forEach((creature) => creature.button.remove());
      announcement.remove();
    },
  };
}
