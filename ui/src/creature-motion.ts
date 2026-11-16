// Five rigid UUID groups, connected at the four printed hyphens.
export const JOINT_INDICES = [8, 13, 18, 23] as const;
const VERTEX_INDICES = [0, ...JOINT_INDICES, 35];
const LINK_LENGTHS = [48, 30, 30, 30, 72];
const TAU = Math.PI * 2;

export type Point = { x: number; y: number };
export type LetterPose = Point & { rotation: number };
export type Action = "inch" | "peek" | "sniff" | "stretch" | "rest";
export type Motion = {
  action: Action;
  elapsed: number;
  duration: number;
  period: number;
  cycles: number;
  amplitude: number;
  blinkIn: number;
  blinkTime: number;
  blinkDuration: number;
  random: () => number;
};
export type Pose = {
  vertices: Point[];
  joints: Point[];
  letters: LetterPose[];
  eyeOpen: number;
  gaze: Point;
};
type PoseOptions = {
  direction: number;
  reduced: boolean;
  mode: "walking" | "held" | "falling";
  grip: number;
  sway: number;
};

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
const sample = (random: () => number) => clamp(random(), 0, 1 - 1e-12);
const between = (motion: Motion, low: number, high: number) =>
  low + sample(motion.random) * (high - low);
const smooth = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function beginAction(motion: Motion, action: Action) {
  motion.action = action;
  motion.elapsed = 0;
  if (action === "inch") {
    motion.period = between(motion, 2.8, 4.8);
    motion.cycles = 2 + Math.floor(sample(motion.random) * 3);
    motion.amplitude = between(motion, 0.95, 1.2);
    motion.duration = motion.period * motion.cycles;
    return;
  }
  const durations = {
    peek: [2.5, 5.5],
    sniff: [2, 4],
    stretch: [3, 5],
    rest: [4, 10],
  } as const;
  const [low, high] = durations[action];
  motion.duration = between(motion, low, high);
}

function nextAction(motion: Motion): Action {
  const weights: [Action, number][] = [
    ["inch", 5],
    ["peek", 2],
    ["sniff", 2],
    ["stretch", 1],
    ["rest", 2],
  ];
  const choices = weights.filter(([action]) => action !== motion.action);
  let selection = sample(motion.random) *
    choices.reduce((total, [, weight]) => total + weight, 0);
  for (const [action, weight] of choices) {
    selection -= weight;
    if (selection < 0) return action;
  }
  return choices[choices.length - 1][0];
}

export function createMotion(random: () => number = Math.random): Motion {
  const motion: Motion = {
    action: "inch",
    elapsed: 0,
    duration: 0,
    period: 0,
    cycles: 0,
    amplitude: 0,
    blinkIn: 0,
    blinkTime: -1,
    blinkDuration: 0.16,
    random,
  };
  beginAction(motion, "inch");
  motion.blinkIn = between(motion, 1.5, 5.5);
  return motion;
}

function gaitAngle(motion: Motion, time: number) {
  const phase = (time / motion.period) % 1;
  return motion.amplitude * Math.sin(phase * Math.PI) ** 2;
}

// Curl with the leading end planted; extend with the trailing end planted.
// The center advances half the change in span on each half of the cycle.
function gaitTravel(motion: Motion, time: number) {
  const cycles = time / motion.period;
  const phase = cycles - Math.floor(cycles);
  const stride = 60 * (1 - Math.cos(motion.amplitude));
  const shortening = 60 * (1 - Math.cos(gaitAngle(motion, time)));
  return Math.floor(cycles) * stride +
    (phase <= 0.5 ? shortening / 2 : stride - shortening / 2);
}

function advanceBlink(motion: Motion, seconds: number) {
  let remaining = seconds;
  while (remaining > 0) {
    if (motion.blinkTime < 0) {
      const step = Math.min(remaining, motion.blinkIn);
      motion.blinkIn -= step;
      remaining -= step;
      if (motion.blinkIn <= 0) {
        motion.blinkTime = 0;
        motion.blinkDuration = between(motion, 0.12, 0.22);
      }
    } else {
      const step = Math.min(remaining, motion.blinkDuration - motion.blinkTime);
      motion.blinkTime += step;
      remaining -= step;
      if (motion.blinkTime >= motion.blinkDuration) {
        motion.blinkTime = -1;
        motion.blinkIn = between(motion, 2, 6.5);
      }
    }
  }
}

/** Advance only while visible and walking; dragging and reduced motion freeze the clock. */
export function advanceMotion(motion: Motion, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return { distance: 0, action: motion.action };
  let remaining = seconds;
  let distance = 0;
  while (remaining > 0) {
    const step = Math.min(remaining, motion.duration - motion.elapsed);
    if (motion.action === "inch")
      distance += gaitTravel(motion, motion.elapsed + step) -
        gaitTravel(motion, motion.elapsed);
    motion.elapsed += step;
    advanceBlink(motion, step);
    remaining -= step;
    if (motion.elapsed >= motion.duration) beginAction(motion, nextAction(motion));
  }
  return { distance: Math.max(0, distance), action: motion.action };
}

function rig(angles: number[]): Point[] {
  const vertices: Point[] = [{ x: 0, y: 0 }];
  for (let index = 0; index < LINK_LENGTHS.length; index++) {
    const previous = vertices[index];
    vertices.push({
      x: previous.x + Math.cos(angles[index]) * LINK_LENGTHS[index],
      y: previous.y + Math.sin(angles[index]) * LINK_LENGTHS[index],
    });
  }
  return vertices;
}

export function poseMotion(motion: Motion, options: PoseOptions): Pose {
  const { direction, reduced, mode } = options;
  const angles = [0, 0, 0, 0, 0];
  const gaze = { x: direction * 0.75, y: 0 };
  let eyeOpen = 1;
  let pivot = -1;

  // Releasing preserves the hanging pose and its grip-space origin. Gravity
  // moves that origin; the body does not jump to a centered walking pose.
  if (mode === "held" || mode === "falling") {
    const grip = clamp(options.grip, 0, 1) * 35;
    pivot = JOINT_INDICES.reduce(
      (nearest, index) => Math.abs(index - grip) < Math.abs(nearest - grip)
        ? index : nearest,
      JOINT_INDICES[0] as number,
    );
    pivot = VERTEX_INDICES.indexOf(pivot);
    const sway = reduced ? 0 : clamp(options.sway, -18, 18) * 0.015;
    for (let index = 0; index < angles.length; index++) {
      angles[index] = index < pivot
        ? -Math.min(1.42, 0.8 + (pivot - 1 - index) * 0.18) + sway
        : Math.min(1.42, 0.8 + (index - pivot) * 0.18) + sway;
    }
  } else if (!reduced) {
    const progress = clamp(motion.elapsed / motion.duration, 0, 1);
    // Smooth entry/exit gives every idle behavior a neutral hand-off stance.
    const envelope = smooth(progress / 0.22) * smooth((1 - progress) / 0.22);
    let arch = 0;
    let headLift = 0;
    switch (motion.action) {
      case "inch":
        arch = gaitAngle(motion, motion.elapsed);
        break;
      case "peek":
        headLift = (0.26 + 0.07 * Math.sin(progress * TAU)) * envelope;
        gaze.x += direction * Math.sin(progress * TAU) * envelope;
        gaze.y = -0.55 * envelope;
        break;
      case "sniff":
        arch = 0.1 * envelope;
        headLift = (0.03 + 0.14 * (0.5 + 0.5 * Math.cos(progress * TAU * 2))) * envelope;
        gaze.y = 1.1 * envelope;
        break;
      case "stretch":
        arch = 0.42 * envelope;
        angles[0] = 0.18 * envelope;
        angles[4] = -0.18 * envelope;
        break;
      case "rest":
        arch = 0.045 * envelope * (0.65 + 0.35 * Math.sin(progress * TAU * 2));
        eyeOpen = 1 - 0.78 * envelope;
        break;
    }
    angles[1] = -arch;
    angles[3] = arch;
    if (direction > 0) angles[4] -= headLift;
    else angles[0] += headLift;
    if (motion.blinkTime >= 0)
      eyeOpen *= 1 - Math.sin(Math.PI * clamp(motion.blinkTime / motion.blinkDuration, 0, 1));
  }

  const vertices = rig(angles);
  let offsetX = -(vertices[0].x + vertices[5].x) / 2;
  let offsetY = -Math.max(...vertices.map((vertex) => vertex.y));
  if (pivot >= 0) {
    offsetX = -vertices[pivot].x;
    offsetY = -vertices[pivot].y;
  } else if (mode === "walking" && !reduced &&
    (motion.action === "peek" || motion.action === "sniff")) {
    // Keep the resting tail planted while the other end investigates.
    offsetX = direction > 0 ? -105 : 105 - vertices[5].x;
  }
  for (const vertex of vertices) {
    vertex.x += offsetX;
    vertex.y += offsetY;
  }
  const letters = Array.from({ length: 36 }, (_, index): LetterPose => {
    let segment = 0;
    while (segment < 4 && index > VERTEX_INDICES[segment + 1]) segment++;
    const start = vertices[segment];
    const end = vertices[segment + 1];
    const fraction = (index - VERTEX_INDICES[segment]) /
      (VERTEX_INDICES[segment + 1] - VERTEX_INDICES[segment]);
    const isJoint = segment < 4 && index === VERTEX_INDICES[segment + 1];
    const rotation = isJoint ? (angles[segment] + angles[segment + 1]) / 2 : angles[segment];
    return {
      x: start.x + (end.x - start.x) * fraction,
      y: start.y + (end.y - start.y) * fraction,
      rotation: rotation * 180 / Math.PI,
    };
  });
  return {
    vertices,
    joints: vertices.slice(1, -1),
    letters,
    eyeOpen,
    gaze,
  };
}
