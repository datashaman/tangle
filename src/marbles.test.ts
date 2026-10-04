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

import { tStream as tStreamFull, DRUMS, type TModel, type TCore } from "./marbles.ts";
const tStream = (seed: number, p: TCore) => { const n = tStreamFull(seed, p); return () => n().mask; };
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
  const p = { ...T("independent", 0.5), step: 0.25, jitter: 0, scale: "chromatic", root: 48, voices: [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }] as [any, any] };
  const pat = marbles(p, 1);
  const ev = [...pat(0, 1)];
  p.step = 0.1;
  ev.push(...pat(1, 2));
  const t = ev.map((e) => e.time);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
  assert.ok(t.some((x) => x > 1.0 && x < 2) && t.every((x) => x < 2));
  assert.ok(ev.every((e) => e.params!.shape === (e.voice ? 3 : 0)));
});

test("jitter 0 is an exact grid; jitter 1 wanders but stays near the straight clock", () => {
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }] as [any, any];
  const times = (jitter: number) => marbles({ ...T("independent", 0), step: 0.25, jitter, scale: "chromatic", root: 48, voices }, 1)(0, 100).filter((e) => e.voice === 0).map((e) => e.time);
  assert.deepEqual(times(0).slice(0, 5), [0, 0.25, 0.5, 0.75, 1]);
  const t = times(1), grid = t.map((_, i) => i * 0.25);
  assert.ok(t.some((x, i) => Math.abs(x - grid[i]) > 0.01), "no jitter happened");
  assert.ok(t.every((x, i) => i === 0 || x > t[i - 1]), "not monotone");
  assert.ok(Math.abs(t.at(-1)! - 100) < 5, `drifted: last tick ${t.at(-1)}`);
});

import { pulsesAt } from "./marbles.ts";
const near = (a: number[], b: number[]) => assert.ok(a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9), `${a} vs ${b}`);

test("pulsesAt: ratios place pulses at k*q/p ticks", () => {
  near(pulsesAt(0, 1, 1), [0]);
  near(pulsesAt(0, 4, 1), [0, 0.25, 0.5, 0.75]);
  near(pulsesAt(0, 1, 2), [0]); near(pulsesAt(1, 1, 2), []); // 1/2: every other tick
  near(pulsesAt(0, 3, 2), [0, 2 / 3]); near(pulsesAt(1, 3, 2), [1 / 3]); // 3/2 over 2 ticks = 3 pulses
});

test("t: divider bias 0 is 8:(1/8) over 8 ticks; centre is 1:1; clusters at centre is 1:1", () => {
  const ticks = (model: TModel, bias: number, n: number) => { const t = tStreamFull(9, T(model, bias)); return Array.from({ length: n }, () => t().pulses); };
  const d = ticks("divider", 0, 8);
  assert.equal(d.flat().filter((x) => x.ch === 0).length, 64);
  assert.equal(d.flat().filter((x) => x.ch === 1).length, 1);
  assert.ok(ticks("divider", 0.5, 6).every((t) => t.length === 2 && t.every((x) => x.phase === 0)));
  assert.ok(ticks("clusters", 0.5, 6).every((t) => t.length === 2 && t.every((x) => x.phase === 0)));
  const c = ticks("clusters", 1, 200).flat();
  assert.ok(c.every((x) => x.phase >= 0 && x.phase < 1 && x.period > 0) && c.some((x) => x.phase > 0));
});

import { SCALES } from "./marbles.ts";
test("marbles: pitches stay inside the chosen scale and root", () => {
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }] as [any, any];
  const base = { ...T("independent", 0.5, 0), step: 0.25, jitter: 0, voices };
  const pitches = (scale: string, root: number) => marbles({ ...base, scale, root }, 1)(0, 200).map((e) => e.pitch - e.voice! * 12);
  for (const [name, deg] of Object.entries(SCALES)) {
    const set = new Set([...deg, ...deg.map((d) => d + 12)].map((d) => 50 + d));
    assert.ok(pitches(name, 50).every((x) => set.has(x)), name);
  }
  assert.ok(new Set(pitches("major pentatonic", 60)).size > 5); // actually wanders across the scale
});
