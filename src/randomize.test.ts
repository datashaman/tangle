import test from "node:test";
import assert from "node:assert/strict";
import { randomize } from "./randomize.ts";
import { DEFAULTS, sanitize } from "./presets.ts";

const seeded = (a: number) => () => { // mulberry32
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mixer = (p: typeof DEFAULTS) => [p.volume, p.hrtf, ...p.voices.flatMap((v) => [v.level, v.on])];

test("randomize music leaves voices and the mixer alone", () => {
  for (let s = 1; s <= 50; s++) {
    const n = randomize(DEFAULTS, "music", seeded(s));
    assert.deepEqual(n.voices, DEFAULTS.voices);
    assert.deepEqual(mixer(n), mixer(DEFAULTS));
  }
});

test("randomize all re-rolls voice sound and position but not the mixer", () => {
  const n = randomize(DEFAULTS, "all", seeded(7));
  assert.notDeepEqual(n.voices.map((v) => [v.shape, v.timbre, v.az]), DEFAULTS.voices.map((v) => [v.shape, v.timbre, v.az]));
  assert.deepEqual(mixer(n), mixer(DEFAULTS));
});

test("every roll is valid (survives sanitize unchanged), reproducible, and actually varies", () => {
  const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) {
    const n = randomize(DEFAULTS, s % 2 ? "all" : "music", seeded(s));
    assert.deepEqual(sanitize(n), n, `seed ${s}`);
    seen.add(n.model);
    assert.notEqual(n.scale, "custom");
  }
  assert.equal(seen.size, 7); // every rhythm model turns up
  assert.deepEqual(randomize(DEFAULTS, "all", seeded(3)), randomize(DEFAULTS, "all", seeded(3)));
  assert.notEqual(randomize(DEFAULTS, "music", seeded(3)).seed, randomize(DEFAULTS, "music", seeded(4)).seed);
});
