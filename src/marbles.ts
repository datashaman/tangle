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
// from a déjà vu stream and let a model decide which of the 2 channels fire. Returns a bitmask per tick.
// Omitted: clusters and divider models (need the ramp/divider machinery), pulse-width randomness.
export type TModel = "bernoulli" | "independent" | "threeStates" | "drums" | "markov";
export type VoiceParams = { shape: number; timbre: number; color: number }; // Braids, timbre/color 0..1
export type TCore = DejaVu & { bias: number; model: TModel };
export type TParams = TCore & { step: number; jitter: number; voices: [VoiceParams, VoiceParams] };

export const DRUMS = [
  [1, 0, 0, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 0], [1, 0, 1, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 2],
  [1, 0, 1, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 0, 2], [1, 0, 0, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 1, 2],
  [1, 0, 0, 1, 2, 0, 0, 0], [0, 2, 1, 1, 2, 0, 1, 2], [1, 0, 0, 1, 2, 0, 1, 0], [0, 2, 1, 1, 2, 2, 1, 2],
  [1, 0, 0, 1, 2, 0, 1, 2], [0, 2, 0, 1, 2, 0, 1, 2], [1, 0, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 0],
  [1, 2, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 2],
];

export function tStream(seed: number, p: TCore): () => { mask: number; jitter: number } {
  const next = dejaVuStream(seed, p);
  let drumStep = 8, drumIdx = 0, ptr = 0;
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
    return { mask, jitter: x[5] };
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

// Stateful: advances one tick per step, so windows must arrive in order (run() does).
// Channel 0/1 -> voice 0/1; each draws its pitch from its own déjà vu stream (Marbles' X outputs).
// ponytail: minor-pentatonic quantizer; a rate change takes effect from the next tick.
export const marbles = (p: TParams, seed = 1, root = 48): Pattern => {
  const t = tStream(seed, p);
  const x = [dejaVuStream(seed + 1, p), dejaVuStream(seed + 2, p)];
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  let at: number | undefined; // next tick time; p.step may change live, so accumulate instead of i * step
  let phaseDiff = 0; // how far the jittered clock has drifted from the straight one (in ticks)
  return (from, to) => {
    at ??= from;
    const out: Ev[] = [];
    while (at < to) {
      const { mask, jitter } = t();
      for (let ch = 0; ch < 2; ch++) {
        if (mask >> ch & 1) {
          out.push({ time: at, pitch: root + 12 * ch + scale[Math.floor(x[ch]() * scale.length)], dur: p.step * 0.5, voice: ch, params: { ...p.voices[ch] } });
        }
      }
      // Marbles' jitter: random tempo multiplier of up to +-j^4*36 semitones, nudged back toward the straight clock.
      const semis = (fastBeta(jitter) * 2 - 1) * p.jitter ** 4 * 36;
      const mult = 2 ** (semis / 12) * (phaseDiff > 0 ? 1 + phaseDiff : 1 / (1 - phaseDiff));
      phaseDiff += 1 / mult - 1;
      at += p.step / mult;
    }
    return out;
  };
};
