// Defaults, valid ranges and (de)serialization for the whole parameter set. Anything loaded from a URL or storage is
// untrusted: sanitize() rebuilds a fresh, clamped object, so e.g. step=0 can never reach the scheduler loop.
import { CUSTOM, SCALES, maskOf, type GrainParams, type SamplerParams, type TModel, type TParams, type VoiceParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";

export const MODELS: TModel[] = ["bernoulli", "independent", "threeStates", "drums", "markov", "clusters", "divider"];

// [min, max, step]: the slider specs and the clamp limits in one place.
export const R = {
  dejaVu: [0, 1, 0.01], length: [1, 16, 1], bias: [0, 1, 0.01], step: [0.05, 0.5, 0.01], jitter: [0, 1, 0.01],
  spread: [0, 1, 0.01], pitchBias: [0, 1, 0.01], root: [48, 59, 1], seed: [1, 999999, 1], mask: [1, 4095, 1],
  shape: [0, SHAPES.length - 1, 1], timbre: [0, 1, 0.01], color: [0, 1, 0.01],
  az: [-180, 180, 1], el: [-90, 90, 1], dist: [1, 10, 0.1], walk: [-90, 90, 1], swing: [0, 180, 1], swingEl: [0, 90, 1], swingDist: [0, 9, 0.1],
  level: [0, 1, 0.01], send: [0, 1, 0.01], volume: [0, 1, 0.01],
  delayMix: [0, 1, 0.01], delayTicks: [1, 8, 0.5], delayFeedback: [0, 0.9, 0.01], reverbMix: [0, 1, 0.01], reverbSize: [0, 3, 1],
  drive: [0, 1, 0.01], chorusMix: [0, 1, 0.01], filter: [0, 1, 0.01], filterRes: [0, 1, 0.01],
  source: [0, 2, 1], size: [0, 1, 0.01], scatter: [0, 1, 0.01], follow: [0, 1, 0.01], grainSpread: [0, 1, 0.01],
  slice: [0, 1, 0.01],
  spaceDejaVu: [0, 1, 0.01], spaceLength: [1, 16, 1],
} as const;

export const DEFAULTS: TParams = {
  dejaVu: 0.5, length: 8, bias: 0.5, model: "bernoulli", step: 0.25, jitter: 0,
  scale: "minor pentatonic", root: 48, spread: 0.75, pitchBias: 0.5, seed: 1, mask: maskOf(SCALES["minor pentatonic"]), hrtf: true, volume: 0.8, delayMix: 0, delayTicks: 3, delayFeedback: 0.4, reverbMix: 0, reverbSize: 2, drive: 0, chorusMix: 0, filter: 1, filterRes: 0, // effects start off (filter fully open)
  sampler: { on: false, source: 0, length: 0.5, scatter: 0.3, follow: 0.5, level: 0.8, delaySend: 0, reverbSend: 0 },
  grain: { on: false, source: 0, size: 0.5, scatter: 0.3, follow: 0.5, spread: 0.5, level: 0.8, delaySend: 0, reverbSend: 0 },
  spaceDejaVu: 0.5, spaceLength: 8, // pitch spread 0.75 / bias 0.5 = uniform pitches
  voices: [
    { shape: 0, timbre: 0.5, color: 0.5, on: true, az: -45, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1, delaySend: 1, reverbSend: 1 },
    { shape: 3, timbre: 0.5, color: 0.5, on: true, az: 45, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1, delaySend: 1, reverbSend: 1 },
    { shape: 5, timbre: 0.5, color: 0.5, on: false, az: 0, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1, delaySend: 1, reverbSend: 1 }, // master clock voice, off until asked for
  ],
};

const num = (v: unknown, [lo, hi]: readonly [number, number, number], fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function sanitize(raw: unknown, base: TParams = DEFAULTS): TParams {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const voice = (v: any, b: VoiceParams): VoiceParams => ({
    shape: Math.round(num(v?.shape, R.shape, b.shape)), timbre: num(v?.timbre, R.timbre, b.timbre), color: num(v?.color, R.color, b.color),
    on: typeof v?.on === "boolean" ? v.on : b.on,
    az: num(v?.az, R.az, b.az), el: num(v?.el, R.el, b.el), dist: num(v?.dist, R.dist, b.dist),
    walk: num(v?.walk, R.walk, b.walk), swing: num(v?.swing, R.swing, b.swing),
    swingEl: num(v?.swingEl, R.swingEl, b.swingEl), swingDist: num(v?.swingDist, R.swingDist, b.swingDist), level: num(v?.level, R.level, b.level),
    delaySend: num(v?.delaySend, R.send, b.delaySend), reverbSend: num(v?.reverbSend, R.send, b.reverbSend),
  });
  const grain = (g: any, b: GrainParams): GrainParams => ({
    on: typeof g?.on === "boolean" ? g.on : b.on, source: Math.round(num(g?.source, R.source, b.source)), size: num(g?.size, R.size, b.size),
    scatter: num(g?.scatter, R.scatter, b.scatter), follow: num(g?.follow, R.follow, b.follow), spread: num(g?.spread, R.grainSpread, b.spread), level: num(g?.level, R.level, b.level),
    delaySend: num(g?.delaySend, R.send, b.delaySend), reverbSend: num(g?.reverbSend, R.send, b.reverbSend),
  });
  const sampler = (g: any, b: SamplerParams): SamplerParams => ({
    on: typeof g?.on === "boolean" ? g.on : b.on, source: Math.round(num(g?.source, R.source, b.source)), length: num(g?.length, R.slice, b.length),
    scatter: num(g?.scatter, R.scatter, b.scatter), follow: num(g?.follow, R.follow, b.follow), level: num(g?.level, R.level, b.level),
    delaySend: num(g?.delaySend, R.send, b.delaySend), reverbSend: num(g?.reverbSend, R.send, b.reverbSend),
  });
  return {
    dejaVu: num(r.dejaVu, R.dejaVu, base.dejaVu), length: Math.round(num(r.length, R.length, base.length)),
    bias: num(r.bias, R.bias, base.bias), model: MODELS.includes(r.model) ? r.model : base.model,
    step: num(r.step, R.step, base.step), jitter: num(r.jitter, R.jitter, base.jitter),
    scale: typeof r.scale === "string" && (r.scale === CUSTOM || Object.hasOwn(SCALES, r.scale)) ? r.scale : base.scale,
    root: Math.round(num(r.root, R.root, base.root)), spread: num(r.spread, R.spread, base.spread),
    pitchBias: num(r.pitchBias, R.pitchBias, base.pitchBias), seed: Math.round(num(r.seed, R.seed, base.seed)), mask: Math.round(num(r.mask, R.mask, base.mask)),
    hrtf: typeof r.hrtf === "boolean" ? r.hrtf : base.hrtf, volume: num(r.volume, R.volume, base.volume),
    delayMix: num(r.delayMix, R.delayMix, base.delayMix), delayTicks: num(r.delayTicks, R.delayTicks, base.delayTicks),
    delayFeedback: num(r.delayFeedback, R.delayFeedback, base.delayFeedback), reverbMix: num(r.reverbMix, R.reverbMix, base.reverbMix),
    reverbSize: Math.round(num(r.reverbSize, R.reverbSize, base.reverbSize)),
    drive: num(r.drive, R.drive, base.drive), chorusMix: num(r.chorusMix, R.chorusMix, base.chorusMix),
    filter: num(r.filter, R.filter, base.filter), filterRes: num(r.filterRes, R.filterRes, base.filterRes),
    spaceDejaVu: num(r.spaceDejaVu, R.spaceDejaVu, base.spaceDejaVu), spaceLength: Math.round(num(r.spaceLength, R.spaceLength, base.spaceLength)),
    grain: grain(r.grain, base.grain), sampler: sampler(r.sampler, base.sampler),
    voices: [0, 1, 2].map((i) => voice(r.voices?.[i], base.voices[i])) as TParams["voices"],
  };
}

export const encode = (p: TParams) => btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decode(s: string): TParams | null {
  try { return sanitize(JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")))); } catch { return null; }
}
