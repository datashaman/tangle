// 16-bit PCM WAV from recorded blocks: each block is one Float32Array per channel (all channels the same length).
export function encodeWav(blocks: Float32Array[][], sampleRate: number): Uint8Array<ArrayBuffer> {
  const ch = blocks[0]?.length ?? 2, frames = blocks.reduce((n, b) => n + b[0].length, 0);
  const out = new DataView(new ArrayBuffer(44 + frames * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF"); out.setUint32(4, 36 + frames * ch * 2, true); str(8, "WAVEfmt ");
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sampleRate, true); out.setUint32(28, sampleRate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, "data"); out.setUint32(40, frames * ch * 2, true);
  let o = 44;
  for (const b of blocks) for (let i = 0; i < b[0].length; i++) for (let c = 0; c < ch; c++, o += 2) {
    const x = Math.max(-1, Math.min(1, b[c][i]));
    out.setInt16(o, x < 0 ? x * 32768 : x * 32767, true);
  }
  return new Uint8Array(out.buffer);
}
