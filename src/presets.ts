// Defaults, valid ranges and (de)serialization for the whole parameter set. Anything loaded from a URL or storage is
// untrusted: sanitize() rebuilds a fresh, clamped object, so e.g. step=0 can never reach the scheduler loop.
import { CUSTOM, SCALES, maskOf, type TModel, type TParams, type VoiceParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";

export const MODELS: TModel[] = ["bernoulli", "independent", "threeStates", "drums", "markov", "clusters", "divider"];

// [min, max, step]: the slider specs and the clamp limits in one place.
export const R = {
  dejaVu: [0, 1, 0.01], length: [1, 16, 1], bias: [0, 1, 0.01], step: [0.05, 0.5, 0.01], jitter: [0, 1, 0.01],
  spread: [0, 1, 0.01], pitchBias: [0, 1, 0.01], root: [48, 59, 1], seed: [1, 999999, 1], mask: [1, 4095, 1],
  shape: [0, SHAPES.length - 1, 1], timbre: [0, 1, 0.01], color: [0, 1, 0.01],
  az: [-180, 180, 1], el: [-90, 90, 1], dist: [1, 10, 0.1], walk: [-90, 90, 1], swing: [0, 180, 1], swingEl: [0, 90, 1], swingDist: [0, 9, 0.1],
  level: [0, 1, 0.01], volume: [0, 1, 0.01],
  spaceDejaVu: [0, 1, 0.01], spaceLength: [1, 16, 1],
} as const;

export const DEFAULTS: TParams = {
  dejaVu: 0.5, length: 8, bias: 0.5, model: "bernoulli", step: 0.25, jitter: 0,
  scale: "minor pentatonic", root: 48, spread: 0.75, pitchBias: 0.5, seed: 1, mask: maskOf(SCALES["minor pentatonic"]), hrtf: true, volume: 0.8, spaceDejaVu: 0.5, spaceLength: 8, // spread 0.75 / bias 0.5 = uniform pitches
  voices: [
    { shape: 0, timbre: 0.5, color: 0.5, on: true, az: -45, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1 },
    { shape: 3, timbre: 0.5, color: 0.5, on: true, az: 45, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1 },
    { shape: 5, timbre: 0.5, color: 0.5, on: false, az: 0, el: 0, dist: 1.5, walk: 0, swing: 0, swingEl: 0, swingDist: 0, level: 1 }, // master clock voice, off until asked for
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
  });
  return {
    dejaVu: num(r.dejaVu, R.dejaVu, base.dejaVu), length: Math.round(num(r.length, R.length, base.length)),
    bias: num(r.bias, R.bias, base.bias), model: MODELS.includes(r.model) ? r.model : base.model,
    step: num(r.step, R.step, base.step), jitter: num(r.jitter, R.jitter, base.jitter),
    scale: typeof r.scale === "string" && (r.scale === CUSTOM || Object.hasOwn(SCALES, r.scale)) ? r.scale : base.scale,
    root: Math.round(num(r.root, R.root, base.root)), spread: num(r.spread, R.spread, base.spread),
    pitchBias: num(r.pitchBias, R.pitchBias, base.pitchBias), seed: Math.round(num(r.seed, R.seed, base.seed)), mask: Math.round(num(r.mask, R.mask, base.mask)),
    hrtf: typeof r.hrtf === "boolean" ? r.hrtf : base.hrtf, volume: num(r.volume, R.volume, base.volume),
    spaceDejaVu: num(r.spaceDejaVu, R.spaceDejaVu, base.spaceDejaVu), spaceLength: Math.round(num(r.spaceLength, R.spaceLength, base.spaceLength)),
    voices: [0, 1, 2].map((i) => voice(r.voices?.[i], base.voices[i])) as TParams["voices"],
  };
}

export const encode = (p: TParams) => btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decode(s: string): TParams | null {
  try { return sanitize(JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")))); } catch { return null; }
}
