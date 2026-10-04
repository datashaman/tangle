// Defaults, valid ranges and (de)serialization for the whole parameter set. Anything loaded from a URL or storage is
// untrusted: sanitize() rebuilds a fresh, clamped object, so e.g. step=0 can never reach the scheduler loop.
import { SCALES, type TModel, type TParams, type VoiceParams } from "./marbles.ts";
import { SHAPES } from "./braids/shapes.ts";

export const MODELS: TModel[] = ["bernoulli", "independent", "threeStates", "drums", "markov", "clusters", "divider"];

// [min, max, step]: the slider specs and the clamp limits in one place.
export const R = {
  dejaVu: [0, 1, 0.01], length: [1, 16, 1], bias: [0, 1, 0.01], step: [0.05, 0.5, 0.01], jitter: [0, 1, 0.01],
  spread: [0, 1, 0.01], pitchBias: [0, 1, 0.01], root: [48, 59, 1], seed: [1, 999999, 1],
  shape: [0, SHAPES.length - 1, 1], timbre: [0, 1, 0.01], color: [0, 1, 0.01],
} as const;

export const DEFAULTS: TParams = {
  dejaVu: 0.5, length: 8, bias: 0.5, model: "bernoulli", step: 0.25, jitter: 0,
  scale: "minor pentatonic", root: 48, spread: 0.75, pitchBias: 0.5, seed: 1, // spread 0.75 / bias 0.5 = uniform pitches
  voices: [{ shape: 0, timbre: 0.5, color: 0.5 }, { shape: 3, timbre: 0.5, color: 0.5 }],
};

const num = (v: unknown, [lo, hi]: readonly [number, number, number], fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

export function sanitize(raw: unknown, base: TParams = DEFAULTS): TParams {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const voice = (v: any, b: VoiceParams): VoiceParams => ({
    shape: Math.round(num(v?.shape, R.shape, b.shape)), timbre: num(v?.timbre, R.timbre, b.timbre), color: num(v?.color, R.color, b.color),
  });
  return {
    dejaVu: num(r.dejaVu, R.dejaVu, base.dejaVu), length: Math.round(num(r.length, R.length, base.length)),
    bias: num(r.bias, R.bias, base.bias), model: MODELS.includes(r.model) ? r.model : base.model,
    step: num(r.step, R.step, base.step), jitter: num(r.jitter, R.jitter, base.jitter),
    scale: typeof r.scale === "string" && Object.hasOwn(SCALES, r.scale) ? r.scale : base.scale,
    root: Math.round(num(r.root, R.root, base.root)), spread: num(r.spread, R.spread, base.spread),
    pitchBias: num(r.pitchBias, R.pitchBias, base.pitchBias), seed: Math.round(num(r.seed, R.seed, base.seed)),
    voices: [voice(r.voices?.[0], base.voices[0]), voice(r.voices?.[1], base.voices[1])],
  };
}

export const encode = (p: TParams) => btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decode(s: string): TParams | null {
  try { return sanitize(JSON.parse(atob(s.replace(/-/g, "+").replace(/_/g, "/")))); } catch { return null; }
}
