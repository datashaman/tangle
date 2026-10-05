# tangle

An experiment in sequencing sound in non-linear ways, in the browser. [Mutable Instruments](https://github.com/pichenettes/eurorack) Braids (compiled to WASM, running in an AudioWorklet) is the sound source; the sequencing is a TypeScript port of Marbles' random-sequencing algorithms.

## How it works

- **Sound source:** Mutable Instruments Braids (the Eurorack oscillator), compiled to WebAssembly and run inside an AudioWorklet. Three voices, each its own Braids instance.
- **Sequencing:** the random-sequencing ideas from Marbles, ported to TypeScript. A rhythm generator decides when each voice fires (Bernoulli, drums, clusters, dividers…), a "déjà vu" control decides how much of the last N steps repeats vs. mutates, jitter wobbles the timing, and pitches are drawn from a scale you pick. No grid, no fixed loop, just streams of controlled randomness.
- **Space:** each voice also has its own random stream for position, so notes move around you in 3D (HRTF, best on headphones). The déjà vu for space can loop on a different cycle than the notes.
- **Mixer + effects:** per-voice levels and delay/reverb sends, tempo-synced delay, reverb, drive, chorus and a lowpass filter.
- **Granular + sampler:** a grain voice cuts up the last 4 seconds of what the voices played, and a sampler plays slices of a file you load. Both are triggered by the pulses of whichever voice you pick, so they follow the same rhythm and melody.
- **Playing with it:** freeze (locks the current loop), randomize / undo, "capture" to grab what just played and loop it, presets (saved locally, shareable by link, or exported as a file), and WAV recording.
- **Ambient:** load the "ambient drift" preset for something slow and washy.

Tip: voice 3 plays on every tick, so use it for a bass or kick beat.

## Run

```sh
npm install
npm run dev      # then browse to the page (http://localhost:5173) and hit start; headphones recommended for the 3D mode
npm test
npm run build
```

`src/braids/braids.wasm` is committed. To rebuild it you need [emscripten](https://emscripten.org): `sh scripts/build-braids.sh` (fetches the Mutable Instruments source into `vendor/`).

## License

MIT. Includes code derived from Mutable Instruments (Emilie Gillet), also MIT; see `LICENSE`.
