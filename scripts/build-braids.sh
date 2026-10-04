#!/bin/sh
# Fetch Braids source (gitignored under vendor/) and compile it to src/braids/braids.wasm.
set -e
cd "$(dirname "$0")/.."
B=vendor/eurorack
[ -d $B ] || git clone -q --depth 1 https://github.com/pichenettes/eurorack.git $B
[ -f $B/stmlib/stmlib.h ] || git -C $B submodule update --init --depth 1 stmlib
emcc -O2 -std=c++17 -I$B --no-entry -sSTANDALONE_WASM -sINITIAL_MEMORY=1048576 -sALLOW_MEMORY_GROWTH=0 \
  -sEXPORTED_FUNCTIONS=_b_init,_b_strike,_b_set,_b_render \
  src/braids/wrapper.cc $B/braids/macro_oscillator.cc $B/braids/analog_oscillator.cc \
  $B/braids/digital_oscillator.cc $B/braids/resources.cc $B/stmlib/utils/random.cc \
  -o src/braids/braids.wasm
