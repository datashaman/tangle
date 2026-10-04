// Granular voice. Records its stereo input into a ring buffer and plays grains cut from it on request.
// Events arrive as {time, dur, params: {pos, pan, semis}} in AudioContext time:
//   pos 0..1   how far back in the buffer the grain starts (0 = what just played)
//   pan -1..1  position in the stereo field      semis  playback pitch shift in semitones
const SECONDS = 4, MAX = 64;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

class GrainProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.n = Math.round(SECONDS * sampleRate);
    this.buf = [new Float32Array(this.n), new Float32Array(this.n)];
    this.w = 0; // write head
    this.q = []; // grain requests, sorted by time
    this.grains = [];
    this.port.onmessage = ({ data }) => {
      this.q.push(data);
      this.q.sort((a, b) => a.time - b.time);
    };
  }
  start({ dur, params = {} }) {
    if (this.grains.length >= MAX) return;
    const width = Math.max(4, Math.round(dur * sampleRate));
    const ratio = 2 ** (clamp(params.semis ?? 0, -24, 24) / 12);
    const eaten = width * ratio; // the play head must not overtake the write head, so start at least this far back
    const back = eaten + clamp(params.pos ?? 0, 0, 1) * Math.max(0, this.n - eaten - width);
    const a = (clamp(params.pan ?? 0, -1, 1) + 1) * Math.PI / 4; // equal-power pan
    this.grains.push({ at: this.w - back, i: 0, width, ratio, l: Math.cos(a), r: Math.sin(a) });
  }
  process(ins, outs) {
    const [inL, inR = inL] = ins[0], [outL, outR] = outs[0];
    const n = this.n;
    for (let s = 0; s < outL.length; s++) {
      const t = (currentFrame + s) / sampleRate;
      while (this.q.length && this.q[0].time <= t) this.start(this.q.shift());
      this.buf[0][this.w] = inL ? inL[s] : 0;
      this.buf[1][this.w] = inR ? inR[s] : 0;
      this.w = (this.w + 1) % n;
      let l = 0, r = 0;
      for (const g of this.grains) {
        if (g.i >= g.width) continue;
        const p = g.at + g.i * g.ratio, i0 = Math.floor(p), f = p - i0;
        const a = ((i0 % n) + n) % n, b = (a + 1) % n;
        const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * g.i / g.width);
        const mid = ((this.buf[0][a] + this.buf[1][a]) * (1 - f) + (this.buf[0][b] + this.buf[1][b]) * f) * 0.5 * env; // mono grain, placed by its own pan
        l += mid * g.l * 1.4142;
        r += mid * g.r * 1.4142;
        g.i++;
      }
      outL[s] = l; outR[s] = r;
    }
    this.grains = this.grains.filter((g) => g.i < g.width); // finished grains are skipped inside the block, dropped here
    return true;
  }
}
registerProcessor("grains", GrainProcessor);
