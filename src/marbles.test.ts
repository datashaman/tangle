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
const T = (model: TModel, bias: number, dejaVu = 0, length = 8) => ({ model, bias, dejaVu, length, seed: 1, hrtf: true, volume: 0.8, delayMix: 0, delayTicks: 3, delayFeedback: 0.4, reverbMix: 0, reverbSize: 2, drive: 0, chorusMix: 0, filter: 1, filterRes: 0, spaceDejaVu: 0.5, spaceLength: 8, grain: { on: false, source: 0, size: 0.5, scatter: 0.3, follow: 0.5, spread: 0.5, level: 0.8 } });

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
  const p = { ...T("independent", 0.5), step: 0.25, jitter: 0, scale: "chromatic", mask: 1, root: 48, spread: 0.75, pitchBias: 0.5, voices: [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any] };
  const pat = marbles(p);
  const ev = [...pat(0, 1)];
  p.step = 0.1;
  ev.push(...pat(1, 2));
  const t = ev.map((e) => e.time);
  assert.deepEqual(t, [...t].sort((a, b) => a - b));
  assert.ok(t.some((x) => x > 1.0 && x < 2) && t.every((x) => x < 2));
  assert.ok(ev.every((e) => e.params!.shape === (e.voice ? 3 : 0)));
});

test("jitter 0 is an exact grid; jitter 1 wanders but stays near the straight clock", () => {
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any];
  const times = (jitter: number) => marbles({ ...T("independent", 0), step: 0.25, jitter, scale: "chromatic", mask: 1, root: 48, spread: 0.75, pitchBias: 0.5, voices })(0, 100).filter((e) => e.voice === 0).map((e) => e.time);
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
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any];
  const base = { ...T("independent", 0.5, 0), mask: 1, step: 0.25, jitter: 0, spread: 0.75, pitchBias: 0.5, voices };
  const pitches = (scale: string, root: number) => marbles({ ...base, scale, root })(0, 200).map((e) => e.pitch - e.voice! * 12);
  for (const [name, deg] of Object.entries(SCALES)) {
    const set = new Set([...deg, ...deg.map((d) => d + 12)].map((d) => 50 + d));
    assert.ok(pitches(name, 50).every((x) => set.has(x)), name);
  }
  assert.ok(new Set(pitches("major pentatonic", 60)).size > 5); // actually wanders across the scale
});

import { betaPpf, xValue } from "./marbles.ts";
test("betaPpf matches known beta quantiles", () => {
  assert.ok(Math.abs(betaPpf(0.3, 1, 1) - 0.3) < 1e-6);
  assert.ok(Math.abs(betaPpf(0.5, 2, 2) - 0.5) < 1e-6);
  assert.ok(Math.abs(betaPpf(0.5, 2, 5) - 0.26445) < 1e-4); // median of Beta(2,5)
});

test("xValue: spread 0.75/bias 0.5 is uniform; spread 0 pins to bias; spread 1 is a coin flip; bias moves the mean", () => {
  const us = Array.from({ length: 99 }, (_, i) => (i + 1) / 100);
  const mean = (s: number, b: number) => us.reduce((a, u) => a + xValue(u, s, b), 0) / us.length;
  for (const u of us) assert.ok(Math.abs(xValue(u, 0.75, 0.5) - u) < 0.02, `uniform at ${u}`);
  for (const u of us) assert.ok(Math.abs(xValue(u, 0, 0.3) - 0.3) < 1e-6);
  assert.ok(us.every((u) => { const v = xValue(u, 1, 0.5); return v === 0 || v === 0.999999; }));
  assert.ok(mean(0.5, 0.2) < 0.4 && mean(0.5, 0.8) > 0.6, "bias should move the mean");
  const spreadOf = (s: number) => { const v = us.map((u) => xValue(u, s, 0.5)); const m = v.reduce((a, b) => a + b) / v.length; return v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length; };
  assert.ok(spreadOf(0.25) < spreadOf(0.5) && spreadOf(0.5) < spreadOf(0.9), "spread should widen the distribution");
});

test("marbles: changing p.seed mid-run reseeds; same seed reproduces", () => {
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any];
  const mk = (seed: number) => ({ ...T("independent", 0.5, 0), step: 0.25, jitter: 0, scale: "chromatic", mask: 1, root: 48, spread: 0.75, pitchBias: 0.5, voices, seed });
  const pitches = (p: any) => marbles(p)(0, 30).map((e) => e.pitch);
  assert.deepEqual(pitches(mk(1)), pitches(mk(1)));
  assert.notDeepEqual(pitches(mk(1)), pitches(mk(2)));
  const live = mk(1), pat = marbles(live);
  pat(0, 10); live.seed = 2;
  assert.deepEqual(pat(10, 40).map((e) => e.pitch), marbles(mk(2))(10, 40).map((e) => e.pitch));
});

test("voice 3 plays every tick an octave down; muting it changes nothing else", () => {
  const mk = (on: boolean) => ({ ...T("independent", 0.5, 0), step: 0.25, jitter: 0, scale: "chromatic", mask: 1, root: 60, spread: 0.75, pitchBias: 0.5,
    voices: [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on }] as [any, any, any] });
  const off = marbles(mk(false))(0, 10), on = marbles(mk(true))(0, 10);
  assert.ok(off.every((e) => e.voice !== 2));
  const v3 = on.filter((e) => e.voice === 2);
  assert.equal(v3.length, 40); // 10s / 0.25s
  assert.ok(v3.every((e) => e.pitch >= 48 && e.pitch < 72)); // root 60 - 12, plus a two-octave scale
  assert.deepEqual(on.filter((e) => e.voice !== 2), off); // same notes for voices 1+2: streams advance while muted
});

import { CUSTOM, effectiveMask, maskOf, scaleDegrees } from "./marbles.ts";
test("custom scale: mask drives the notes; presets are equivalent masks; empty mask is safe", () => {
  for (const [name, deg] of Object.entries(SCALES)) assert.deepEqual(scaleDegrees({ scale: name, mask: 1 }), deg, name);
  assert.equal(effectiveMask({ scale: "major", mask: 1 }), maskOf(SCALES.major));
  assert.deepEqual(scaleDegrees({ scale: CUSTOM, mask: 0 }), [0]);
  const voices = [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: true }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any];
  const mask = maskOf([0, 11]); // C and B only
  const ev = marbles({ ...T("independent", 0.5, 0), step: 0.25, jitter: 0, scale: CUSTOM, mask, root: 50, spread: 0.75, pitchBias: 0.5, voices })(0, 100);
  assert.deepEqual([...new Set(ev.map((e) => e.pitch - e.voice! * 12))].sort((a, b) => a - b), [50, 61, 62, 73]);
});

const motionParams = (over: any, dejaVu = 0.5, length = 4, space = { spaceDejaVu: dejaVu, spaceLength: length }) => ({ ...T("independent", 0, dejaVu, length), ...space, step: 0.25, jitter: 0, scale: "chromatic", mask: 1, root: 48, spread: 0.75, pitchBias: 0.5,
  voices: [{ shape: 0, timbre: 0.5, color: 0.5, on: true, az: 10, el: 0, dist: 2, walk: 0, swing: 0, swingEl: 0, swingDist: 0, ...over }, { shape: 3, timbre: 0.5, color: 0.5, on: false, az: 0, el: 0, dist: 2, walk: 0, swing: 0, swingEl: 0, swingDist: 0 }, { shape: 5, timbre: 0.5, color: 0.5, on: false, az: 0, el: 0, dist: 2, walk: 0, swing: 0, swingEl: 0, swingDist: 0 }] as [any, any, any] });
const v0 = (ev: any[]) => ev.filter((e) => e.voice === 0);

test("motion: no walk or swing means no position events", () => {
  assert.ok(v0(marbles(motionParams({}))(0, 5)).every((e) => e.pos?.az === undefined));
});

test("motion: walk advances the azimuth per note and wraps", () => {
  const az = v0(marbles(motionParams({ walk: 100 }))(0, 5)).map((e) => e.pos?.az);
  assert.deepEqual(az.slice(0, 4), [110, -150, -50, 50]); // 10+100, 10+200 wraps to -150, ...
});

test("motion: swing stays within +-swing of the base, and deja vu 0.5 loops it", () => {
  const az = v0(marbles(motionParams({ swing: 40 }, 0.5, 4))(0, 20)).map((e) => e.pos?.az);
  assert.ok(az.every((a: number) => a >= 10 - 40 && a <= 10 + 40));
  assert.deepEqual(az.slice(0, 4), az.slice(4, 8));
  assert.ok(new Set(az.slice(0, 4)).size > 1);
});

test("motion: yields while held, then resumes from the start of the walk", () => {
  let held = false;
  const pat = marbles(motionParams({ walk: 30 }), () => held);
  const first = v0(pat(0, 1.01)).map((e) => e.pos?.az); // 5 notes walking: 40, 70, 100, 130, 160
  assert.deepEqual(first, [40, 70, 100, 130, 160]);
  held = true;
  assert.ok(v0(pat(1.01, 2.01)).every((e) => e.pos?.az === undefined));
  held = false;
  assert.deepEqual(v0(pat(2.01, 2.6)).map((e) => e.pos?.az).slice(0, 2), [40, 70]); // restarts from the dropped base
});

test("motion: elevation and distance swing stay in range and clamp at the limits", () => {
  const pos = (over: any) => v0(marbles(motionParams(over))(0, 30)).map((e) => e.pos);
  const a = pos({ swingEl: 30, swingDist: 1 });
  assert.ok(a.every((q: any) => Math.abs(q.el) <= 30 && q.dist >= 1 && q.dist <= 3));
  assert.ok(new Set(a.map((q: any) => q.el)).size > 1 && new Set(a.map((q: any) => q.dist)).size > 1);
  const b = pos({ el: 80, dist: 1, swingEl: 30, swingDist: 5 });
  assert.ok(b.every((q: any) => q.el <= 90 && q.el >= 50 && q.dist >= 1 && q.dist <= 6));
});

test("motion: spatial deja vu loops independently of the rhythm and pitch loop", () => {
  // rhythm/pitch fully random (deja vu 0), spatial pattern locked to a 4-note loop
  const ev = v0(marbles(motionParams({ swing: 40, swingEl: 20 }, 0, 8, { spaceDejaVu: 0.5, spaceLength: 4 }))(0, 20));
  const az = ev.map((e) => e.pos?.az), el = ev.map((e) => e.pos?.el), pitch = ev.map((e) => e.pitch);
  assert.deepEqual(az.slice(0, 4), az.slice(4, 8));
  assert.deepEqual(el.slice(0, 4), el.slice(4, 8));
  assert.notDeepEqual(pitch.slice(0, 4), pitch.slice(4, 8));
});

test("freeze: setting deja vu to 0.5 loops the last `length` steps", () => {
  const p = motionParams({}, 0, 8); // rhythm/pitch fully random; voice 1 fires every tick
  const pat = marbles(p);
  const before = v0(pat(0, 20)).map((e) => e.pitch); // 80 ticks of ever-changing notes
  p.dejaVu = 0.5; // freeze
  const after = v0(pat(20, 30)).map((e) => e.pitch);
  assert.deepEqual(after.slice(0, 8), before.slice(-8)); // the last 8 steps, in order...
  assert.deepEqual(after.slice(8, 16), after.slice(0, 8)); // ...repeating
  assert.deepEqual(after.slice(32, 40), after.slice(0, 8));
  assert.ok(new Set(before.slice(-8)).size > 1);
});

test("granular voice: one grain per source pulse, off by default, never disturbs the notes", () => {
  const mk = (grain?: any) => ({ ...T("independent", 0.5, 0), step: 0.25, jitter: 0, scale: "chromatic", mask: 1, root: 48, spread: 0.75, pitchBias: 0.5, grain,
    voices: [{ shape: 0, timbre: 0.5, color: 0.5, on: true }, { shape: 3, timbre: 0.5, color: 0.5, on: false }, { shape: 5, timbre: 0.5, color: 0.5, on: false }] as [any, any, any] });
  const base = marbles(mk())(0, 10);
  assert.ok(base.every((e) => e.voice !== 3));
  const g = { on: true, source: 1, size: 0.5, scatter: 0.4, follow: 1, spread: 0.5, level: 0.8 }; // source voice is muted: grains still play
  const ev = marbles(mk(g))(0, 10);
  assert.deepEqual(ev.filter((e) => e.voice !== 3), base); // notes unchanged
  const grains = ev.filter((e) => e.voice === 3);
  assert.ok(grains.length > 0);
  assert.ok(grains.every((e) => e.params!.pos >= 0 && e.params!.pos <= 0.4 && Math.abs(e.params!.pan) <= 0.5 && e.dur > 0.019 && e.dur < 0.51));
  assert.ok(marbles(mk({ ...g, source: 2 }))(0, 10).filter((e) => e.voice === 3).length === 40); // voice 3 fires every tick
  assert.ok(grains.every((e) => e.params!.semis === e.pitch - 48), "follow 1 transposes by the melody");
});
