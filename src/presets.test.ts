import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, decode, encode, sanitize } from "./presets.ts";

test("preset survives a share-link round trip", () => {
  const p = { ...structuredClone(DEFAULTS), model: "drums" as const, scale: "blues", jitter: 0.4, root: 53, length: 5 };
  p.voices[1] = { shape: 33, timbre: 0.1, color: 0.9, on: false, az: 120, el: -20, dist: 4, walk: -30, swing: 60, swingEl: 15, swingDist: 2.5, level: 0.4 };
  p.volume = 0.6;
  p.spaceDejaVu = 0.2; p.spaceLength = 5;
  p.hrtf = false;
  assert.deepEqual(decode(encode(p)), p);
});

test("hostile or broken input is clamped to safe values", () => {
  const s = sanitize({ step: 0, jitter: 99, length: -3, model: "evil", scale: "__proto__", root: "x", voices: [{ shape: 1e9 }, null], extra: 1 });
  assert.equal(s.step, 0.05); // step 0 would hang the scheduler
  assert.equal(s.jitter, 1);
  assert.equal(s.length, 1);
  assert.equal(s.model, DEFAULTS.model);
  assert.equal(s.scale, DEFAULTS.scale);
  assert.equal(s.root, DEFAULTS.root);
  assert.equal(s.voices[0].shape, 47);
  assert.deepEqual(s.voices[1], DEFAULTS.voices[1]);
  assert.ok(!("extra" in s));
  assert.equal(decode("not base64 json!!"), null);
  assert.deepEqual(sanitize(null), DEFAULTS);
});

test("seed round-trips and is clamped", () => {
  assert.equal(decode(encode({ ...DEFAULTS, seed: 4242 }))!.seed, 4242);
  assert.equal(sanitize({ seed: -5 }).seed, 1);
  assert.equal(sanitize({ seed: 1e12 }).seed, 999999);
});

test("old two-voice links still load; voice 3 defaults to off", () => {
  const old = { voices: [{ shape: 7 }, { shape: 8 }] };
  const s = sanitize(old);
  assert.equal(s.voices[2].on, false);
  assert.equal(s.voices[0].shape, 7);
});

test("custom scale name and mask are accepted and clamped", () => {
  const s = sanitize({ scale: "custom", mask: 0b101 });
  assert.equal(s.scale, "custom");
  assert.equal(s.mask, 5);
  assert.equal(sanitize({ mask: 0 }).mask, 1);
  assert.equal(sanitize({ mask: 1e9 }).mask, 4095);
});

test("spatial params are clamped; old presets get default positions", () => {
  const s = sanitize({ voices: [{ az: 999, el: -999, dist: 0 }] });
  assert.deepEqual([s.voices[0].az, s.voices[0].el, s.voices[0].dist], [180, -90, 1]);
  assert.equal(s.voices[1].az, DEFAULTS.voices[1].az);
  assert.equal(s.hrtf, true);
});

test("motion params are clamped and default to off", () => {
  const s = sanitize({ voices: [{ walk: 999, swing: -5 }] });
  assert.deepEqual([s.voices[0].walk, s.voices[0].swing], [90, 0]);
  assert.ok(DEFAULTS.voices.every((v) => v.walk === 0 && v.swing === 0));
});

test("spatial motion extras: clamped, default off, space deja vu defaults match the old behaviour", () => {
  const s = sanitize({ spaceDejaVu: 9, spaceLength: 0, voices: [{ swingEl: 999, swingDist: -1 }] });
  assert.deepEqual([s.spaceDejaVu, s.spaceLength, s.voices[0].swingEl, s.voices[0].swingDist], [1, 1, 90, 0]);
  assert.deepEqual([DEFAULTS.spaceDejaVu, DEFAULTS.spaceLength], [0.5, 8]);
});

test("mixer levels are clamped; defaults are unity per voice and 0.8 master", () => {
  const s = sanitize({ volume: 5, voices: [{ level: -1 }, { level: 0.25 }] });
  assert.deepEqual([s.volume, s.voices[0].level, s.voices[1].level, s.voices[2].level], [1, 0, 0.25, 1]);
  assert.equal(DEFAULTS.volume, 0.8);
});

test("effects settings round-trip, are clamped, and default to off", () => {
  const p = { ...structuredClone(DEFAULTS), delayMix: 0.3, delayTicks: 4.5, delayFeedback: 0.55, reverbMix: 0.2, reverbSize: 3 };
  assert.deepEqual(decode(encode(p)), p);
  const s = sanitize({ delayMix: 5, delayTicks: 0, delayFeedback: 2, reverbMix: -1, reverbSize: 9 });
  assert.deepEqual([s.delayMix, s.delayTicks, s.delayFeedback, s.reverbMix, s.reverbSize], [1, 1, 0.9, 0, 3]);
  assert.deepEqual([DEFAULTS.delayMix, DEFAULTS.reverbMix], [0, 0]);
});
