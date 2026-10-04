import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, decode, encode, sanitize } from "./presets.ts";

test("preset survives a share-link round trip", () => {
  const p = { ...structuredClone(DEFAULTS), model: "drums" as const, scale: "blues", jitter: 0.4, root: 53, length: 5 };
  p.voices[1] = { shape: 33, timbre: 0.1, color: 0.9 };
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
