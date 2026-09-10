/**
 * Tiny keyframe engine for the brand studio.
 *
 * A track drives one parameter path over normalised time. Values are absolute by
 * default; `rel` adds to the value the composition had when you pressed play and
 * `mul` scales it, so every animation works around whatever layout you built
 * rather than snapping to hardcoded coordinates.
 */

export const EASE = {
  linear:      t => t,
  inOutSine:   t => -(Math.cos(Math.PI * t) - 1) / 2,
  inOutCubic:  t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuint:    t => 1 - Math.pow(1 - t, 5),
  outExpo:     t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inExpo:      t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
  outBack:     t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inOutBack:   t => { const c2 = 1.70158 * 1.525;
                      return t < 0.5 ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
                                     : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },
  outElastic:  t => { const c4 = (2 * Math.PI) / 3;
                      return t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1; },
  outBounce:   t => { const n1 = 7.5625, d1 = 2.75;
                      if (t < 1 / d1) return n1 * t * t;
                      if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
                      if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
                      return n1 * (t -= 2.625 / d1) * t + 0.984375; },
  step:        t => t < 1 ? 0 : 1
};

const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** value of one track at normalised time u */
function trackValue(track, u, base) {
  const keys = track.keys;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
  const [t0, v0, ease] = keys[i];
  const [t1, v1] = keys[i + 1] ?? keys[i];
  const span = t1 - t0;
  const local = span <= 0 ? 1 : Math.max(0, Math.min(1, (u - t0) / span));
  const e = (EASE[ease] || EASE.inOutCubic)(local);

  if (typeof v0 === 'string') {                       // colour track
    const a = hexToRgb(v0), b = hexToRgb(v1);
    return rgbToHex(lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e));
  }
  const v = lerp(v0, v1, e);
  if (track.rel) return base + v;
  if (track.mul) return base * v;
  return v;
}

export const ANIMATIONS = [
  {
    id: 'drop', name: 'drop in', duration: 3.0,
    tracks: [
      { path: 'key.y',    rel: true, keys: [[0, 78, 'outBounce'], [0.62, 0]] },
      { path: 'key.rz',   rel: true, keys: [[0, -14, 'outElastic'], [0.8, 0]] },
      { path: 'logo.size', mul: true, keys: [[0, 0.01, 'linear'], [0.45, 0.01, 'outBack'], [0.95, 1]] },
      { path: 'logo.ry',  rel: true, keys: [[0.45, 34, 'outExpo'], [1, 0]] },
      { path: 'light.angle', keys: [[0, -110, 'inOutCubic'], [1, -35]] }
    ]
  },
  {
    id: 'turntable', name: 'turntable', duration: 7.0, loop: true,
    tracks: [
      { path: 'key.ry',  keys: [[0, -46, 'linear'], [0.5, 46, 'linear'], [1, -46]] },
      { path: 'key.rx',  rel: true, keys: [[0, 0, 'inOutSine'], [0.5, 13, 'inOutSine'], [1, 0]] },
      { path: 'key.y',   rel: true, keys: [[0, 0, 'inOutSine'], [0.5, 5, 'inOutSine'], [1, 0]] },
      { path: 'logo.ry', keys: [[0, 16, 'inOutSine'], [0.5, -16, 'inOutSine'], [1, 16]] },
      { path: 'light.angle', keys: [[0, -160, 'linear'], [1, 200]] }
    ]
  },
  {
    id: 'unlock', name: 'unlock', duration: 3.4,
    tracks: [
      { path: 'key.rz',  rel: true, keys: [[0, 0, 'inOutBack'], [0.42, -92, 'outElastic'], [0.78, 0]] },
      { path: 'key.size', mul: true, keys: [[0, 1, 'inOutSine'], [0.42, 1.06, 'outBack'], [0.72, 1]] },
      { path: 'logo.y',  rel: true, keys: [[0, -26, 'linear'], [0.45, -26, 'outExpo'], [0.95, 0]] },
      { path: 'logo.size', mul: true, keys: [[0, 0.001, 'linear'], [0.45, 0.001, 'outBack'], [0.95, 1]] },
      { path: 'bg',      keys: [[0, '#f8280c', 'step'], [0.42, '#251ef2', 'outExpo'], [0.62, '#f8280c']] },
      { path: 'light.key', keys: [[0, 3.4, 'step'], [0.42, 8.5, 'outExpo'], [0.7, 3.4]] }
    ]
  },
  {
    id: 'breathe', name: 'breathe', duration: 6.0, loop: true,
    tracks: [
      { path: 'key.size',  mul: true, keys: [[0, 1, 'inOutSine'], [0.5, 1.07, 'inOutSine'], [1, 1]] },
      { path: 'key.ry',    rel: true, keys: [[0, -8, 'inOutSine'], [0.5, 8, 'inOutSine'], [1, -8]] },
      { path: 'logo.size', mul: true, keys: [[0, 1, 'inOutSine'], [0.5, 1.04, 'inOutSine'], [1, 1]] },
      { path: 'key.gloss', keys: [[0, 0.35, 'inOutSine'], [0.5, 0.9, 'inOutSine'], [1, 0.35]] },
      { path: 'noise',     keys: [[0, 0.04, 'inOutSine'], [0.5, 0.14, 'inOutSine'], [1, 0.04]] },
      { path: 'light.angle', keys: [[0, -70, 'inOutSine'], [0.5, 10, 'inOutSine'], [1, -70]] }
    ]
  },
  {
    id: 'riso', name: 'riso flicker', duration: 2.4, loop: true,
    tracks: [
      { path: 'bg', keys: [
        [0, '#f8280c', 'step'], [0.25, '#251ef2', 'step'], [0.5, '#080204', 'step'],
        [0.62, '#ffffff', 'step'], [0.75, '#f8280c', 'step'], [1, '#f8280c']] },
      { path: 'key.rz',   rel: true, keys: [[0, -3, 'step'], [0.25, 4, 'step'], [0.5, -2, 'step'], [0.75, 3, 'step'], [1, -3]] },
      { path: 'logo.rz',  rel: true, keys: [[0, 2, 'step'], [0.25, -3, 'step'], [0.5, 2, 'step'], [0.75, -2, 'step'], [1, 2]] },
      { path: 'grain',    keys: [[0, 1.2, 'step'], [0.5, 4.5, 'step'], [1, 1.2]] },
      { path: 'noise',    keys: [[0, 0.08, 'step'], [0.5, 0.22, 'step'], [1, 0.08]] }
    ]
  },
  {
    id: 'flyby', name: 'fly by', duration: 3.6,
    tracks: [
      { path: 'key.x',  rel: true, keys: [[0, -120, 'outQuint'], [0.7, 0]] },
      { path: 'key.ry', keys: [[0, 78, 'outQuint'], [0.7, -18]] },
      { path: 'logo.x', rel: true, keys: [[0, 140, 'linear'], [0.2, 140, 'outExpo'], [0.9, 0]] },
      { path: 'logo.ry', keys: [[0.2, -46, 'outExpo'], [0.9, -10]] },
      { path: 'light.angle', keys: [[0, 120, 'outQuint'], [1, -35]] },
      { path: 'light.env', keys: [[0, 3.2, 'outExpo'], [0.8, 1.5]] }
    ]
  }
];

export class Player {
  constructor({ snapshot, apply, commit, onTick, onEnd }) {
    this.snapshot = snapshot;   // () => base values keyed by path
    this.apply = apply;         // (path, value) => void
    this.commit = commit;       // () => void, once per frame
    this.onTick = onTick;
    this.onEnd = onEnd;
    this.anim = null;
    this.playing = false;
    this.speed = 1;
    this.loop = false;
    this.t0 = 0;
    this.base = null;
    this.elapsed = 0;
  }

  play(anim, now) {
    this.anim = anim;
    this.base = this.snapshot(anim.tracks.map(t => t.path));
    this.loopThis = !!this.loop;
    this.t0 = now;
    this.elapsed = 0;
    this.playing = true;
  }

  stop({ restore = true } = {}) {
    this.playing = false;
    if (restore && this.base) {
      for (const [path, v] of Object.entries(this.base)) this.apply(path, v);
      this.commit();
    }
    this.onEnd?.();
  }

  /** apply the timeline at an exact normalised time, independent of the clock */
  applyAt(anim, base, u) {
    for (const track of anim.tracks) {
      this.apply(track.path, trackValue(track, Math.max(0, Math.min(1, u)), base[track.path]));
    }
    this.commit();
  }

  update(now) {
    if (!this.playing || !this.anim) return;
    const dur = this.anim.duration / Math.max(0.05, this.speed);
    this.elapsed = now - this.t0;
    let u = this.elapsed / dur;
    if (u >= 1 - 1e-6) {          // don't strand a finished animation on a float edge
      u = Math.max(u, 1);
      if (this.loopThis) { this.t0 = now; u = 0; }
      else { u = 1; }
    }
    for (const track of this.anim.tracks) {
      this.apply(track.path, trackValue(track, u, this.base[track.path]));
    }
    this.commit();
    this.onTick?.(Math.min(1, u), this.elapsed, dur);
    if (u >= 1 && !this.loopThis) this.stop({ restore: false });
  }
}
