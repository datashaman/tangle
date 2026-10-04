// Thin C ABI over braids::MacroOscillator for the AudioWorklet.
#include "braids/macro_oscillator.h"
#include <cstdint>
#include <cstring>

static braids::MacroOscillator osc;
static int16_t out[24];
static uint8_t sync[24];

extern "C" {
void b_init() { osc.Init(); memset(sync, 0, sizeof sync); }
void b_strike() { osc.Strike(); }
// pitch in 1/128 semitones (MIDI note << 7), timbre/color are int16 0..32767
void b_set(int shape, int pitch, int timbre, int color) {
  osc.set_shape(static_cast<braids::MacroOscillatorShape>(shape));
  osc.set_pitch(pitch);
  osc.set_parameters(timbre, color);
}
int16_t* b_render() { osc.Render(sync, out, 24); return out; }
}
