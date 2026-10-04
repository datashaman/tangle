// Monophonic Braids voice. Events arrive as {time, pitch, dur, params} in AudioContext time.
// Braids renders 24-sample blocks at 96kHz, so the AudioContext must run at 96000.
class BraidsProcessor extends AudioWorkletProcessor {
  constructor({ processorOptions }) {
    super();
    this.x = new WebAssembly.Instance(new WebAssembly.Module(processorOptions.wasm), {}).exports;
    this.x._initialize();
    this.x.b_init();
    this.q = []; // note-ons, sorted by time
    this.offAt = Infinity;
    this.level = 0;
    this.atk = 0.002;
    this.rel = 0.04;
    this.gate = false;
    this.buf = new Int16Array(24);
    this.i = 24; // force render on first sample
    this.port.onmessage = ({ data }) => {
      this.q.push(data);
      this.q.sort((a, b) => a.time - b.time);
    };
  }
  process(_in, outs) {
    const out = outs[0][0];
    for (let n = 0; n < out.length; n++) {
      const t = (currentFrame + n) / sampleRate;
      while (this.q.length && this.q[0].time <= t) {
        const { pitch, dur, time, params = {} } = this.q.shift();
        const { shape = 0, timbre = 0.5, color = 0.5, attack = 0, release = 0 } = params;
        this.atk = 0.002 * 2000 ** attack; // 2 ms .. 4 s
        this.rel = 0.04 * 100 ** release; // 40 ms .. 4 s
        this.x.b_set(shape, Math.round(pitch * 128), Math.round(timbre * 32767), Math.round(color * 32767));
        this.x.b_strike();
        this.gate = true;
        this.offAt = time + dur;
      }
      if (t >= this.offAt) { this.gate = false; this.offAt = Infinity; }
      if (this.i === 24) {
        this.buf = new Int16Array(this.x.memory.buffer, this.x.b_render(), 24);
        this.i = 0;
      }
      this.level = this.gate ? Math.min(1, this.level + 1 / (this.atk * sampleRate)) : Math.max(0, this.level - 1 / (this.rel * sampleRate));
      out[n] = (this.buf[this.i++] / 32768) * this.level * 0.5;
    }
    return true;
  }
}
registerProcessor("braids", BraidsProcessor);
