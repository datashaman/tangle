// Taps its input and posts every block ([left, right] Float32Arrays) to the page, which encodes them to WAV on stop.
class RecorderProcessor extends AudioWorkletProcessor {
  process(ins) {
    const [l, r = l] = ins[0];
    if (l) this.port.postMessage([l.slice(), r.slice()]);
    return true;
  }
}
registerProcessor("recorder", RecorderProcessor);
