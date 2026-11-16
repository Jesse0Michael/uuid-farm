import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceMotion,
  createMotion,
  JOINT_INDICES,
  poseMotion,
  type Motion,
} from "./creature-motion.ts";

const hinges = [0, 8, 13, 18, 23, 35];
const options = {
  direction: 1,
  reduced: false,
  mode: "walking" as const,
  grip: 0.5,
  sway: 0,
};
const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} ≠ ${expected}`);

function randomSequence(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function assertRigidGroups(pose: ReturnType<typeof poseMotion>) {
  assert.equal(pose.letters.length, 36);
  assert.equal(pose.vertices.length, 6);
  assert.equal(pose.joints.length, 4);
  for (let link = 0; link < hinges.length - 1; link++) {
    const start = hinges[link];
    const end = hinges[link + 1];
    const a = pose.vertices[link];
    const b = pose.vertices[link + 1];
    near(Math.hypot(b.x - a.x, b.y - a.y), (end - start) * 6, "rigid length");
    for (let index = start; index <= end; index++) {
      const letter = pose.letters[index];
      const fraction = (index - start) / (end - start);
      near(letter.x, a.x + (b.x - a.x) * fraction, "letter follows its rigid group");
      near(letter.y, a.y + (b.y - a.y) * fraction, "letter follows its rigid group");
      if (index > start && index < end)
        near(
          letter.rotation,
          (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
          "group letters share the link angle",
        );
    }
  }
  for (const [index, character] of JOINT_INDICES.entries()) {
    near(pose.letters[character].x, pose.joints[index].x, "hyphen sits at hinge");
    near(pose.letters[character].y, pose.joints[index].y, "hyphen sits at hinge");
  }
}

test("UUID groups stay rigid and bend at the four hyphens in every pose", () => {
  assert.deepEqual(JOINT_INDICES, [8, 13, 18, 23]);
  const state = createMotion(randomSequence(42));
  for (const action of ["inch", "peek", "sniff", "stretch", "rest"] as const) {
    state.action = action;
    for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      state.elapsed = state.duration * progress;
      for (const direction of [-1, 1]) {
        assertRigidGroups(poseMotion(state, { ...options, direction }));
        for (const mode of ["held", "falling"] as const)
          for (const grip of [0.08, 0.3, 0.5, 0.7, 0.92])
            assertRigidGroups(
              poseMotion(state, { ...options, direction, mode, grip, sway: 10 }),
            );
      }
    }
  }
});

for (const direction of [-1, 1]) {
  test(`Inching ${direction > 0 ? "right" : "left"} alternates planted feet without sliding`, () => {
    const state = createMotion(() => 0.5);
    const front = direction > 0 ? 5 : 0;
    const rear = direction > 0 ? 0 : 5;
    const pose = () => poseMotion(state, { ...options, direction });
    let traveled = 0;
    const start = pose();
    const plantedFront = start.vertices[front].x;
    for (let step = 0; step < 100; step++) {
      traveled += advanceMotion(state, state.period / 200).distance * direction;
      const current = pose();
      near(current.vertices[front].x + traveled, plantedFront, "front anchors contraction");
      near(current.vertices[front].y, start.vertices[front].y, "front stays on its perch");
      near(current.vertices[rear].y, start.vertices[rear].y, "rear stays on its perch");
    }
    const plantedRear = pose().vertices[rear].x + traveled;
    for (let step = 0; step < 100; step++) {
      traveled += advanceMotion(state, state.period / 200).distance * direction;
      const current = pose();
      near(current.vertices[rear].x + traveled, plantedRear, "rear anchors extension");
      near(current.vertices[front].y, start.vertices[front].y, "front stays on its perch");
      near(current.vertices[rear].y, start.vertices[rear].y, "rear stays on its perch");
    }
    assert.ok(traveled * direction > 10, "a full stride makes forward progress");
  });
}

test("Residents vary their actions and durations without repeating the same action", () => {
  const state = createMotion(randomSequence(801));
  const durations = new Map<string, Set<number>>();
  for (let visit = 0; visit < 100; visit++) {
    assert.ok(state.duration > 0 && state.duration < 30, "bounded positive duration");
    const seen = durations.get(state.action) ?? new Set<number>();
    seen.add(state.duration);
    durations.set(state.action, seen);
    const previous = state.action;
    advanceMotion(state, state.duration - state.elapsed + 1e-6);
    assert.notEqual(state.action, previous);
  }
  assert.deepEqual([...durations.keys()].sort(), ["inch", "peek", "rest", "sniff", "stretch"]);
  for (const [action, seen] of durations)
    assert.ok(seen.size > 1, `${action} should vary in duration`);
});

test("Releasing any hyphen keeps the dangling pose attached to the same anchor", () => {
  const state = createMotion(() => 0.5);
  for (const index of JOINT_INDICES) {
    for (const direction of [-1, 1]) {
      for (const sway of [-12, 0, 12]) {
        const held = poseMotion(state, {
          ...options,
          mode: "held",
          direction,
          grip: index / 35,
          sway,
        });
        const falling = poseMotion(state, {
          ...options,
          mode: "falling",
          direction,
          grip: index / 35,
          sway,
        });
        near(held.letters[index].x, 0, "picked-up hyphen stays under the pointer");
        near(held.letters[index].y, 0, "picked-up hyphen stays under the pointer");
        assert.deepEqual(falling, held, "letting go should not reshape or teleport the resident");
      }
    }
  }
});

test("Action changes meet at a continuous resting pose", () => {
  const state = createMotion(randomSequence(77));
  for (let transition = 0; transition < 25; transition++) {
    state.elapsed = state.duration - 1e-8;
    const before = poseMotion(state, options);
    advanceMotion(state, 1e-8);
    const after = poseMotion(state, options);
    before.vertices.forEach((point, index) => {
      near(after.vertices[index].x, point.x, "no sideways snap at action change");
      near(after.vertices[index].y, point.y, "no vertical snap at action change");
    });
  }
});

test("Reduced motion returns a still pose regardless of action, time, or blinking", () => {
  const state = createMotion(randomSequence(7));
  const resting = poseMotion(state, { ...options, reduced: true });
  for (let step = 0; step < 300; step++) {
    advanceMotion(state, 0.4);
    assert.deepEqual(poseMotion(state, { ...options, reduced: true }), resting);
  }
});

test("Random values at either bound still produce finite poses and timed actions", () => {
  for (const random of [() => 0, () => 1 - Number.EPSILON]) {
    const state: Motion = createMotion(random);
    for (let visit = 0; visit < 20; visit++) {
      assert.ok(Number.isFinite(state.duration) && state.duration > 0);
      const result = advanceMotion(state, state.duration - state.elapsed + 1e-6);
      assert.ok(Number.isFinite(result.distance) && result.distance >= 0);
      for (const letter of poseMotion(state, options).letters) {
        assert.ok(Number.isFinite(letter.x));
        assert.ok(Number.isFinite(letter.y));
        assert.ok(Number.isFinite(letter.rotation));
      }
    }
  }
});
