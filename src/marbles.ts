// Port of the "déjà vu" loop from Mutable Instruments Marbles (marbles/random/random_sequence.h):
// a 16-slot loop of random values. dejaVu=0 always draws new values, 0.5 locks the loop,
// 1 jumps randomly within the loop. Below 0.5 mutation writes new values; above it only shuffles order.
// Omitted: replay/rewrite history (multi-channel locking, external input).
import type { Ev, Pattern } from "./sequencer.ts";

const N = 16;
export type DejaVu = { dejaVu: number; length: number }; // mutable: change live from the UI

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dejaVuStream(seed: number, p: DejaVu): () => number {
  const rnd = mulberry32(seed);
  const loop = Array.from({ length: N }, rnd);
  let head = 0, step = 0;
  return () => {
    const len = Math.min(N, Math.max(1, Math.round(p.length)));
    const dv = p.dejaVu;
    const mutate = rnd() < (2 * dv - 1) ** 2;
    if (mutate && dv <= 0.5) {
      loop[head] = rnd();
      head = (head + 1) % N;
      step = len - 1;
    } else if (mutate) {
      step = Math.floor(rnd() * len);
    } else {
      step = (step + 1) % len;
    }
    return loop[(head + N - len + (step % len)) % N];
  };
}

// Port of Marbles' "t" generator (marbles/random/t_generator.cc): on each clock tick, draw a random vector
// from a déjà vu stream and let a model decide which of the 2 channels fire. Per tick it returns pulses placed at a
// phase (0..1) within the tick; clusters/divider make real polyrhythms, the other models only fire on the tick (phase 0).
// Omitted: pulse-width randomness, external clock, reset.
export type TModel = "bernoulli" | "independent" | "threeStates" | "drums" | "markov" | "clusters" | "divider";
// Braids shape/timbre/color (0..1), mute, and position (see space.ts). Only shape/timbre/color go to the oscillator.
export type VoiceParams = { shape: number; timbre: number; color: number; on: boolean; az: number; el: number; dist: number; walk: number; swing: number; swingEl: number; swingDist: number; level: number; delaySend: number; reverbSend: number };
// Granular voice ("voice 4"): grains cut from the last few seconds of what the voices played, one grain per pulse of
// the `source` voice. Grain position and pan come from that voice's déjà vu spatial streams, pitch follows its melody.
export type GrainParams = { on: boolean; source: number; size: number; scatter: number; follow: number; spread: number; level: number };
export const GRAIN = 3; // Ev.voice index of the granular voice
export const grainSecs = (size: number) => 0.02 * 25 ** size; // 0..1 -> 20 ms .. 0.5 s
export type TCore = DejaVu & { bias: number; model: TModel };
export type TParams = TCore & { step: number; jitter: number; scale: string; root: number; spread: number; pitchBias: number; seed: number; mask: number; hrtf: boolean; volume: number; delayMix: number; delayTicks: number; delayFeedback: number; reverbMix: number; reverbSize: number; drive: number; chorusMix: number; filter: number; filterRes: number; spaceDejaVu: number; spaceLength: number; grain: GrainParams; voices: [VoiceParams, VoiceParams, VoiceParams] };

export const DRUMS = [
  [1, 0, 0, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 0], [1, 0, 1, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 2],
  [1, 0, 1, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 0, 2], [1, 0, 0, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 1, 2],
  [1, 0, 0, 1, 2, 0, 0, 0], [0, 2, 1, 1, 2, 0, 1, 2], [1, 0, 0, 1, 2, 0, 1, 0], [0, 2, 1, 1, 2, 2, 1, 2],
  [1, 0, 0, 1, 2, 0, 1, 2], [0, 2, 0, 1, 2, 0, 1, 2], [1, 0, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 0],
  [1, 2, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 2],
];

// [p0, q0, p1, q1, length]: channel rate multipliers (p/q x master) over `length` master ticks.
type Pat = [number, number, number, number, number];
const CLUSTERS: Pat[] = [
  [1, 1, 1, 1, 1], [1, 1, 2, 1, 1], [1, 2, 1, 1, 2], [1, 1, 4, 1, 1], [1, 2, 2, 1, 2], [1, 1, 3, 2, 2],
  [1, 4, 4, 1, 4], [1, 4, 2, 1, 4], [1, 2, 3, 2, 2], [1, 1, 8, 1, 1], [1, 1, 3, 1, 1], [1, 3, 1, 1, 3],
  [1, 1, 5, 4, 4], [1, 2, 5, 4, 4], [1, 1, 6, 1, 1], [1, 3, 2, 1, 3], [1, 1, 16, 1, 1],
];
const DIVIDERS: Pat[] = [
  [8, 1, 1, 8, 8], [6, 1, 1, 6, 6], [4, 1, 1, 4, 4], [3, 1, 1, 3, 3], [2, 1, 1, 2, 2], [3, 2, 2, 3, 6],
  [4, 3, 3, 4, 12], [5, 4, 4, 5, 20], [1, 1, 1, 1, 1], [4, 5, 5, 4, 20], [3, 4, 4, 3, 12], [2, 2, 3, 2, 6],
  [1, 2, 2, 1, 2], [1, 3, 3, 1, 3], [1, 4, 4, 1, 4], [1, 6, 6, 1, 6], [1, 8, 8, 1, 8],
];

// Phases (0..1) of a p/q-rate channel's pulses inside master tick `m` of its pattern: pulses sit at k*q/p ticks.
export function pulsesAt(m: number, p: number, q: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor((m * p + q - 1) / q); k * q < (m + 1) * p; k++) out.push((k * q - m * p) / p);
  return out;
}

export type Pulse = { ch: number; phase: number; period: number }; // period in master ticks

export function tStream(seed: number, p: TCore): () => { mask: number; jitter: number; pulses: Pulse[] } {
  const next = dejaVuStream(seed, p);
  let drumStep = 8, drumIdx = 0, ptr = 0;
  let patLen = 0, m = 0, pat = CLUSTERS[0]; // clusters/divider: ticks left in pattern, tick index, current pattern
  const hist = new Array(16).fill(0), streak = [0, 0];
  return () => {
    // Marbles' NextVector: one stream value seeds an LCG that expands into the 6-float vector.
    let word = Math.floor(next() * 2 ** 32) >>> 0;
    const x = Array.from({ length: 6 }, () => {
      const v = word / 2 ** 32;
      word = (Math.imul(word, 1664525) + 1013904223) >>> 0;
      return v;
    });
    const u = [x[2], x[3]], pr = x[4], b = p.bias;
    let mask = 0;
    let pulses: Pulse[] | undefined;
    if (p.model === "bernoulli") {
      for (let i = 0; i < 2; i++) if (((u[0] > b ? 1 : 0) ^ (i & 1)) === 1) mask |= 1 << i;
    } else if (p.model === "independent") {
      for (let i = 0; i < 2; i++) if (((u[i] > b ? 1 : 0) ^ (i & 1)) === 1) mask |= 1 << i;
    } else if (p.model === "threeStates") {
      const pNone = 0.75 - Math.abs(b - 0.5);
      const thr = pNone + (1 - pNone) * (0.25 + b * 0.5);
      for (let i = 0; i < 2; i++) if (u[0] > pNone && (((u[0] > thr ? 1 : 0) ^ (i & 1)) === 1)) mask |= 1 << i;
    } else if (p.model === "drums") {
      if (++drumStep >= 8) {
        drumStep = 0;
        drumIdx = Math.floor(DRUMS.length * u[0] * 2 * Math.abs(b - 0.5));
        if (b <= 0.5) drumIdx -= drumIdx % 2;
      }
      mask = DRUMS[drumIdx][drumStep];
    } else if (p.model === "clusters" || p.model === "divider") {
      if (--patLen <= 0) {
        if (p.model === "divider") {
          pat = DIVIDERS[Math.min(16, Math.floor(b * 17))]; // ponytail: Marbles adds hysteresis here; sliders don't need it
        } else {
          const strength = Math.abs(b - 0.5) * 2;
          let v = u[0];
          v *= v + strength * strength * (1 - v);
          v *= strength;
          pat = CLUSTERS[Math.min(16, Math.floor(v * 17))];
          if (b < 0.5) pat = [pat[2], pat[3], pat[0], pat[1], pat[4]];
        }
        patLen = pat[4];
        m = 0;
      } else m++;
      pulses = [];
      for (let ch = 0; ch < 2; ch++) {
        const [pp, q] = [pat[2 * ch], pat[2 * ch + 1]];
        for (const phase of pulsesAt(m, pp, q)) { pulses.push({ ch, phase, period: q / pp }); mask |= 1 << ch; }
      }
    } else {
      const bb = 1.5 * b - 0.5, len = Math.min(16, Math.max(1, Math.round(p.length)));
      hist[ptr] = 0;
      for (let i = 0; i < 2; i++) {
        const m = 1 << i;
        const periodic = hist[(ptr + 8) % 16] & m, simultaneous = hist[(ptr + 8) % 16] & ~m;
        const dense = hist[(ptr + 1) % 16] & m, alternate = hist[(ptr + 4) % 16] & ~m;
        let logit = -1.5;
        if (streak[i] > 24) logit += 10;
        logit += 8 * Math.abs(bb) * (periodic ? bb : -bb);
        logit -= 2 * (simultaneous ? bb : -bb);
        logit -= dense ? bb : 0;
        logit += alternate ? bb : 0;
        logit = Math.min(10, Math.max(-10, logit));
        let state = u[i] < 1 / (1 + 2 ** -logit); // Marbles' lut_logit, fits this to 2e-4
        if (p.dejaVu >= pr) state = (hist[(ptr + len) % 16] & m) !== 0;
        if (state) { mask |= m; streak[i] = 0; } else streak[i]++;
      }
      hist[ptr] |= mask;
      ptr = (ptr + 15) % 16;
    }
    pulses ??= [0, 1].filter((ch) => mask >> ch & 1).map((ch) => ({ ch, phase: 0, period: 1 }));
    return { mask, jitter: x[5], pulses };
  };
}

// Marbles' FastBetaDistributionSample: beta(3,3) with a fatter tail, as a 129-point inverse CDF (resources.cc dist_icdf_4_3).
const ICDF = [
  0.0000, 0.0898, 0.1162, 0.1355, 0.1513, 0.1649, 0.1771, 0.1881, 0.1983, 0.2078,
  0.2168, 0.2253, 0.2334, 0.2412, 0.2487, 0.2559, 0.2628, 0.2696, 0.2761, 0.2825,
  0.2888, 0.2949, 0.3008, 0.3067, 0.3124, 0.3180, 0.3236, 0.3290, 0.3344, 0.3396,
  0.3448, 0.3500, 0.3551, 0.3601, 0.3651, 0.3700, 0.3748, 0.3797, 0.3844, 0.3892,
  0.3939, 0.3985, 0.4032, 0.4078, 0.4123, 0.4169, 0.4214, 0.4259, 0.4304, 0.4348,
  0.4392, 0.4436, 0.4480, 0.4524, 0.4568, 0.4611, 0.4655, 0.4698, 0.4741, 0.4785,
  0.4828, 0.4871, 0.4914, 0.4957, 0.5000, 0.5043, 0.5086, 0.5129, 0.5172, 0.5215,
  0.5259, 0.5302, 0.5345, 0.5389, 0.5432, 0.5476, 0.5520, 0.5564, 0.5608, 0.5652,
  0.5696, 0.5741, 0.5786, 0.5831, 0.5877, 0.5922, 0.5968, 0.6015, 0.6061, 0.6108,
  0.6156, 0.6203, 0.6252, 0.6300, 0.6349, 0.6399, 0.6449, 0.6500, 0.6552, 0.6604,
  0.6656, 0.6710, 0.6764, 0.6820, 0.6876, 0.6933, 0.6992, 0.7051, 0.7112, 0.7175,
  0.7239, 0.7304, 0.7372, 0.7441, 0.7513, 0.7588, 0.7666, 0.7747, 0.7832, 0.7922,
  0.8017, 0.8119, 0.8229, 0.8351, 0.8487, 0.8645, 0.8838, 0.9102, 1.0000,
];
const fastBeta = (u: number) => {
  const f = u * 128, i = Math.min(127, Math.floor(f));
  return ICDF[i] + (ICDF[i + 1] - ICDF[i]) * (f - i);
};

// Marbles' X distribution (random/output_channel.cc + resources/lookup_tables.py): a beta distribution whose mean follows
// `bias` and whose concentration follows `spread`. Marbles bilinearly interpolates precomputed inverse-CDF tables; we
// interpolate the same (mu, nu) grid and evaluate the inverse CDF directly (same parameter mapping, no 19k-float table).
// Below spread ~0.05 it collapses to `bias`; above ~0.95 it becomes a coin flip between the extremes.
const MU = [0.05, 0.125, 0.25, 0.375, 0.5];
const LOG2_NU = [9, 5, 3, 2.5, 2, 1.5, 1, 0.5, -1];

function lgamma(x: number): number { // Lanczos
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, t = x + 5.5;
  t -= (x + 0.5) * Math.log(t);
  let ser = 1.000000000190015;
  for (const k of c) ser += k / ++y;
  return -t + Math.log(2.5066282746310005 * ser / x);
}

function betaCdf(x: number, a: number, b: number): number { // regularized incomplete beta, continued fraction
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cf = (a: number, b: number, x: number) => {
    let c = 1, d = 1 - (a + b) * x / (a + 1);
    d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
    let h = d;
    for (let m = 1; m <= 1000; m++) {
      for (const aa of [m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m)), -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1))]) {
        d = 1 + aa * d; d = 1 / (Math.abs(d) < 1e-300 ? 1e-300 : d);
        c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
        const del = c * d; h *= del;
        if (Math.abs(del - 1) < 1e-12) return h;
      }
    }
    return h;
  };
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * cf(a, b, x) / a : 1 - bt * cf(b, a, 1 - x) / b;
}

export function betaPpf(u: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (betaCdf(mid, a, b) < u) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// u: uniform 0..1 -> value 0..1 (low..high note in the scale).
export function xValue(u: number, spread: number, bias: number): number {
  const degenerate = Math.min(1, Math.max(0, 1.25 - spread * 25));
  const bernoulli = Math.min(1, Math.max(0, spread * 25 - 23.75));
  const flip = bias > 0.5;
  const uu = flip ? 1 - u : u, bb = flip ? 1 - bias : bias;
  const bi = bb * 8, bf = bi - Math.min(3, Math.floor(bi)), bk = Math.min(3, Math.floor(bi));
  const si = spread * 8, sk = Math.min(7, Math.floor(si)), sf = si - sk;
  const mu = MU[bk] + (MU[bk + 1] - MU[bk]) * bf;
  const nu = 2 ** (LOG2_NU[sk] + (LOG2_NU[sk + 1] - LOG2_NU[sk]) * sf);
  const err = Math.exp(-((Math.log2(nu) - 1) ** 2) / 20);
  const cmu = 0.5 * (2 * mu) ** (1 / (1 + 3 * err));
  let y = betaPpf(Math.min(1 - 1e-9, Math.max(1e-9, uu)), cmu * nu, (1 - cmu) * nu);
  if (flip) y = 1 - y;
  let value = y + degenerate * (bias - y);
  value += bernoulli * ((u >= 1 - bias ? 0.999999 : 0) - value);
  return value;
}

const OCTAVE = [0, 12, -12]; // per-voice transposition: voice 2 an octave up, voice 3 (master clock) an octave down

// Scale degrees in semitones within one octave; the quantizer spans two octaves.
// ponytail: presets plus one user-editable scale (`mask`); Marbles' quantizer also weights each degree.
export const SCALES: Record<string, number[]> = {
  "minor pentatonic": [0, 3, 5, 7, 10],
  "major pentatonic": [0, 2, 4, 7, 9],
  "major": [0, 2, 4, 5, 7, 9, 11],
  "natural minor": [0, 2, 3, 5, 7, 8, 10],
  "dorian": [0, 2, 3, 5, 7, 9, 10],
  "phrygian": [0, 1, 3, 5, 7, 8, 10],
  "lydian": [0, 2, 4, 6, 7, 9, 11],
  "mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "blues": [0, 3, 5, 6, 7, 10],
  "whole tone": [0, 2, 4, 6, 8, 10],
  "diminished": [0, 2, 3, 5, 6, 8, 9, 11],
  "chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

// "custom" scale: a 12-bit mask of semitones above the root, edited from the UI.
export const CUSTOM = "custom";
export const maskOf = (deg: number[]) => deg.reduce((m, d) => m | (1 << d), 0);
export const effectiveMask = (p: Pick<TParams, "scale" | "mask">) => (p.scale === CUSTOM ? p.mask : maskOf(SCALES[p.scale] ?? SCALES.chromatic));
export const scaleDegrees = (p: Pick<TParams, "scale" | "mask">) => {
  const deg = [...Array(12).keys()].filter((d) => effectiveMask(p) >> d & 1);
  return deg.length ? deg : [0]; // an empty mask would have nothing to play
};

// Stateful: advances one tick per step, so windows must arrive in order (run() does).
// Channel 0/1 -> voice 0/1 (t1/t3), channel 2 -> voice 3 on the master clock (t2). Muted voices still advance their
// streams, as on the hardware. Each draws its pitch from its own déjà vu stream (Marbles' X outputs).
// Scale and root are read per note, so they can change live; a rate change takes effect from the next tick.
const wrapAz = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

// Spatial motion (per note, so it is part of the sequence): each note's position is the voice's base position plus
//   azimuth   walk * (notes since the voice was released) + swing * (2u - 1)
//   elevation swingEl * (2u - 1)       distance swingDist * (2u - 1)
// with u drawn from per-voice déjà vu streams that have their own déjà vu/length (spaceDejaVu/spaceLength), so the
// spatial pattern can loop on a different cycle from the rhythm and pitches.
// `held(i)` is true while the user is dragging voice i: automation yields (no `pos` on its events, walk restarts), and it
// takes over again from wherever the voice was dropped.
export const marbles = (p: TParams, held: (voice: number) => boolean = () => false): Pattern => {
  // Streams are rebuilt whenever p.seed changes, so reseeding works live.
  let seed = p.seed;
  const space = { get dejaVu() { return p.spaceDejaVu; }, get length() { return p.spaceLength; } }; // read live by the streams
  const build = () => ({
    t: tStream(seed, p), x: [1, 2, 3].map((k) => dejaVuStream(seed + k, p)),
    hop: [[4, 5, 6], [7, 8, 9], [10, 11, 12]].map((ks) => ks.map((k) => dejaVuStream(seed + k, space))), // [az, el, dist][voice]
  });
  let { t, x, hop } = build();
  const walked = [0, 0, 0]; // notes played since each voice was last held
  let at: number | undefined; // next tick time; p.step may change live, so accumulate instead of i * step
  let phaseDiff = 0; // how far the jittered clock has drifted from the straight one (in ticks)
  return (from, to) => {
    if (p.seed !== seed) { seed = p.seed; ({ t, x, hop } = build()); }
    at ??= from;
    const out: Ev[] = [];
    while (at < to) {
      const { pulses: gen, jitter } = t();
      const pulses = [...gen, { ch: 2, phase: 0, period: 1 }]; // master clock (Marbles' t2)
      // Marbles' jitter: random tempo multiplier of up to +-j^4*36 semitones, nudged back toward the straight clock.
      const semis = (fastBeta(jitter) * 2 - 1) * p.jitter ** 4 * 36;
      const mult = 2 ** (semis / 12) * (phaseDiff > 0 ? 1 + phaseDiff : 1 / (1 - phaseDiff));
      phaseDiff += 1 / mult - 1;
      const dt = p.step / mult; // length of this tick; pulses are placed by phase inside it
      const deg = scaleDegrees(p);
      const notes = [...deg, ...deg.map((d) => d + 12)]; // two octaves
      const degree = (v: number) => notes[Math.floor(xValue(v, p.spread, p.pitchBias) * notes.length)];
      for (const { ch, phase, period } of pulses) {
        const pitch = p.root + OCTAVE[ch] + degree(x[ch]());
        const { on, az, el, dist, walk, swing, swingEl, swingDist, level: _level, delaySend: _ds, reverbSend: _rs, ...params } = p.voices[ch];
        const [ua, ue, ud] = hop.map((h) => h[ch]()); // always advance, like the pitch stream
        if (p.grain?.on && p.grain.source === ch) { // grains ride the source voice's pulses, even when that voice is muted
          const g = p.grain;
          out.push({ time: at + phase * dt, pitch, dur: grainSecs(g.size), voice: GRAIN, params: { pos: g.scatter * ua, pan: g.spread * (2 * ue - 1), semis: g.follow * (pitch - p.root) } });
        }
        if (held(ch)) walked[ch] = 0;
        if (!on) continue;
        const moves = !held(ch) && (walk || swing || swingEl || swingDist);
        const pos = moves ? {
          az: wrapAz(az + walk * ++walked[ch] + swing * (2 * ua - 1)),
          el: Math.min(90, Math.max(-90, el + swingEl * (2 * ue - 1))),
          dist: Math.min(10, Math.max(1, dist + swingDist * (2 * ud - 1))),
        } : undefined;
        out.push({ time: at + phase * dt, pitch, dur: Math.min(1, period) * dt * 0.5, voice: ch, pos, params });
      }
      at += dt;
    }
    return out.sort((a, b) => a.time - b.time);
  };
};
