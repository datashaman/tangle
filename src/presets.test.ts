import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, decode, encode, sanitize } from "./presets.ts";

test("preset survives a share-link round trip", () => {
  const p = { ...structuredClone(DEFAULTS), model: "drums" as const, scale: "blues", jitter: 0.4, root: 53, length: 5 };
  p.voices[1] = { shape: 33, timbre: 0.1, color: 0.9, on: false, az: 120, el: -20, dist: 4 };
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
