// Voice position -> WebAudio PannerNode coordinates. Listener sits at the origin facing -z (the WebAudio default).
// azimuth: 0 = front, +90 = right, -90 = left, 180 = behind. elevation: +90 = straight up. distance in metres-ish.
export function position(az: number, el: number, dist: number): [number, number, number] {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [dist * Math.sin(a) * Math.cos(e), dist * Math.sin(e), -dist * Math.cos(a) * Math.cos(e)];
}
