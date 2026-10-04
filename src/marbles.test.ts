import test from "node:test";
import assert from "node:assert/strict";
import { dejaVuStream } from "./marbles.ts";

const take = (n: number, next: () => number) => Array.from({ length: n }, next);

test("dejaVu 0.5 locks to a loop of `length`", () => {
  const s = take(24, dejaVuStream(7, { dejaVu: 0.5, length: 4 }));
  assert.deepEqual(s.slice(0, 4), s.slice(4, 8));
  assert.deepEqual(s.slice(0, 4), s.slice(20, 24));
});

test("dejaVu 0 never repeats; same seed is reproducible", () => {
  const a = take(16, dejaVuStream(7, { dejaVu: 0, length: 4 }));
  assert.notDeepEqual(a.slice(0, 4), a.slice(4, 8));
  assert.deepEqual(a, take(16, dejaVuStream(7, { dejaVu: 0, length: 4 })));
});

test("dejaVu 1 only reorders: values come from the existing loop", () => {
  const loop = new Set(take(4, dejaVuStream(7, { dejaVu: 0.5, length: 4 })));
  for (const v of take(50, dejaVuStream(7, { dejaVu: 1, length: 4 }))) assert.ok(loop.has(v));
});

import { tStream, DRUMS, type TModel } from "./marbles.ts";
const T = (model: TModel, bias: number, dejaVu = 0, length = 8) => ({ model, bias, dejaVu, length });

test("t: complementary bernoulli fires exactly one channel; bias extremes pin it", () => {
  for (const m of take(64, tStream(3, T("bernoulli", 0.5)))) assert.ok(m === 1 || m === 2);
  assert.ok(take(32, tStream(3, T("bernoulli", 0))).every((m) => m === 1));
});

test("t: independent bernoulli bias 1 is never ch0, always ch1", () => {
  assert.ok(take(32, tStream(3, T("independent", 1))).every((m) => m === 2));
});

test("t: drums plays one of the even patterns when bias <= 0.5", () => {
  const got = take(8, tStream(3, T("drums", 0)));
  assert.ok(DRUMS.some((d, i) => i % 2 === 0 && d.every((v, k) => v === got[k])));
});

test("t: dejaVu 0.5 loops the rhythm; markov is reproducible", () => {
  const r = take(24, tStream(5, T("threeStates", 0.5, 0.5, 4)));
  assert.deepEqual(r.slice(0, 4), r.slice(4, 8));
  const a = take(64, tStream(5, T("markov", 0.5)));
  assert.deepEqual(a, take(64, tStream(5, T("markov", 0.5))));
  assert.ok(a.every((m) => m >= 0 && m <= 3) && a.some((m) => m > 0));
});

import { marbles } from "./marbles.ts";
test("marbles: live step change keeps events ordered and windows contiguous", () => {
  const p = { ...T("independent", 0.5), step: 0.25, voices: [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }] as [any, any] };
  const pat = marbles(p, 1);
  const ev = [...pat(0, 1)];
  p.step = 0.1;
  ev.push(...pat(1, 2));
  const t = ev.map((e) => e.time);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
  assert.ok(t.some((x) => x > 1.0 && x < 2) && t.every((x) => x < 2));
  assert.ok(ev.every((e) => e.params!.shape === (e.voice ? 3 : 0)));
});
