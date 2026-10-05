# tangle

An experiment in sequencing sound in non-linear ways, in the browser. [Mutable Instruments](https://github.com/pichenettes/eurorack) Braids (compiled to WASM, running in an AudioWorklet) is the sound source; the sequencing is a TypeScript port of Marbles' random-sequencing algorithms.

- **Sequencing:** Marbles-style rhythm models, déjà vu loops, jitter, scales and three voices, plus a spatial stream per voice (HRTF 3D panning with sequenced motion).
- **Sound:** a mixer with per-voice sends, tempo-synced delay, convolution reverb, drive, chorus and a lowpass filter, a granular voice and a sample slicer that ride the voices' pulses.
- **Performance:** freeze, randomize / undo, takes (capture and loop what just played), presets and share links, WAV recording.
- Try the "ambient drift" preset for something slow.

## Run

```sh
npm install
npm run dev      # http://localhost:5173, then press start (96 kHz AudioContext, headphones recommended for the 3D mode)
npm test
npm run build
```

`src/braids/braids.wasm` is committed. To rebuild it you need [emscripten](https://emscripten.org): `sh scripts/build-braids.sh` (fetches the Mutable Instruments source into `vendor/`).

## License

MIT. Includes code derived from Mutable Instruments (Emilie Gillet), also MIT; see `LICENSE`.
