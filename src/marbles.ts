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
// Omitted: clusters and divider models (need the ramp/divider machinery), clock jitter, pulse-width randomness.
export type TModel = "bernoulli" | "independent" | "threeStates" | "drums" | "markov";
export type VoiceParams = { shape: number; timbre: number; color: number }; // Braids, timbre/color 0..1
export type TCore = DejaVu & { bias: number; model: TModel };
export type TParams = TCore & { step: number; voices: [VoiceParams, VoiceParams] };

export const DRUMS = [
  [1, 0, 0, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 0], [1, 0, 1, 0, 2, 0, 0, 0], [0, 0, 1, 0, 2, 0, 0, 2],
  [1, 0, 1, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 0, 2], [1, 0, 0, 0, 2, 0, 1, 0], [0, 2, 1, 0, 2, 0, 1, 2],
  [1, 0, 0, 1, 2, 0, 0, 0], [0, 2, 1, 1, 2, 0, 1, 2], [1, 0, 0, 1, 2, 0, 1, 0], [0, 2, 1, 1, 2, 2, 1, 2],
  [1, 0, 0, 1, 2, 0, 1, 2], [0, 2, 0, 1, 2, 0, 1, 2], [1, 0, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 0],
  [1, 2, 1, 1, 2, 0, 1, 2], [2, 0, 1, 2, 0, 1, 2, 2],
];

export function tStream(seed: number, p: TCore): () => number {
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
    return mask;
  };
}

// Stateful: advances one tick per step, so windows must arrive in order (run() does).
// Channel 0/1 -> voice 0/1; each draws its pitch from its own déjà vu stream (Marbles' X outputs).
// ponytail: minor-pentatonic quantizer; a rate change takes effect from the next tick.
export const marbles = (p: TParams, seed = 1, root = 48): Pattern => {
  const t = tStream(seed, p);
  const x = [dejaVuStream(seed + 1, p), dejaVuStream(seed + 2, p)];
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
  let at: number | undefined; // next tick time; p.step may change live, so accumulate instead of i * step
  return (from, to) => {
    at ??= from;
    const out: Ev[] = [];
    for (; at < to; at += p.step) {
      const mask = t();
      for (let ch = 0; ch < 2; ch++) {
        if (mask >> ch & 1) {
          out.push({ time: at, pitch: root + 12 * ch + scale[Math.floor(x[ch]() * scale.length)], dur: p.step * 0.5, voice: ch, params: { ...p.voices[ch] } });
        }
      }
    }
    return out;
  };
};
