import test from "node:test";
import assert from "node:assert/strict";
import { delaySeconds, impulse, REVERB_SECONDS } from "./fx.ts";

const seeded = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rms = (a: Float32Array, from: number, to: number) => Math.sqrt(a.slice(from, to).reduce((s, x) => s + x * x, 0) / (to - from));

test("impulse: right length, decaying tail, stereo channels decorrelated, deterministic", () => {
  const sr = 8000, [l, r] = impulse(sr, 1.5, seeded(1));
  assert.equal(l.length, 12000);
  assert.ok(rms(l, 0, 1200) > 20 * rms(l, 10800, 12000), "tail should be far quieter than the start");
  assert.ok(l.every((x) => Math.abs(x) <= 1));
  const corr = l.reduce((s, x, i) => s + x * r[i], 0) / Math.sqrt(l.reduce((s, x) => s + x * x, 0) * r.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(corr) < 0.1, `channels correlated: ${corr}`);
  assert.deepEqual(impulse(sr, 0.5, seeded(2))[0], impulse(sr, 0.5, seeded(2))[0]);
});

test("impulse: the largest reverb stays within the budget", () => {
  assert.ok(Math.max(...REVERB_SECONDS) <= 4);
});

test("delaySeconds follows the tick length and is clamped to the DelayNode's range", () => {
  assert.equal(delaySeconds(3, 0.25), 0.75);
  assert.equal(delaySeconds(8, 0.5), 3.9);
  assert.ok(delaySeconds(0, 0.25) > 0);
});
