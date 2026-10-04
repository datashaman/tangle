// Effects helpers: a generated reverb impulse response and the tempo-synced delay time.

export const REVERB_NAMES = ["small", "room", "hall", "large"];
export const REVERB_SECONDS = [0.7, 1.5, 2.5, 4]; // kept short: the AudioContext runs at 96 kHz, so the convolution is already heavy

// Stereo impulse response: decorrelated noise with an exponential tail (-60 dB at the end) that also darkens as it decays,
// like a real room soaking up the highs. One-pole lowpass whose cutoff falls with time.
export function impulse(sampleRate: number, seconds: number, rnd: () => number = Math.random): Float32Array<ArrayBuffer>[] {
  const n = Math.round(sampleRate * seconds);
  return [0, 1].map(() => {
    const out = new Float32Array(n);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      y += (0.7 * (1 - t) + 0.03) * ((rnd() * 2 - 1) - y);
      out[i] = y * Math.exp(-6.9 * t);
    }
    return out;
  });
}

export const MAX_DELAY = 3.9; // seconds; the DelayNode is created with a 4 s maximum

// Delay time in seconds for a delay of `ticks` ticks at the current tick length.
export const delaySeconds = (ticks: number, step: number) => Math.min(MAX_DELAY, Math.max(0.001, ticks * step));

// Master filter: `x` 0..1 sweeps the lowpass cutoff exponentially from 20 Hz to 20 kHz (1 = wide open); `res` 0..1 is the resonance.
export const filterHz = (x: number) => 20 * 1000 ** x;
export const filterQ = (res: number) => 0.7 + res * res * 14;

// Soft-clip curve for the drive stage: tanh saturation, scaled so small signals pass at about unity-and-a-half gain and peaks top out at 0.5.
export const driveCurve = (n = 1024): Float32Array<ArrayBuffer> => {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(3 * ((i / (n - 1)) * 2 - 1)) / 2;
  return c;
};
