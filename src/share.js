/**
 * Share links: the whole composition packed into the URL hash.
 * Short keys and rounded numbers keep it copy-pasteable; a version field means
 * old links can be migrated rather than silently misread.
 */

const VERSION = 1;
const r = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

function toB64u(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

export function encodeShare(o) {
  return toB64u(JSON.stringify(o));
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** clamp a number into range, falling back when it isn't a finite number at all */
const num = (v, min, max, fallback) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const hex = (v, fallback) => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const bool = v => !!v;

/** the logotype is multi-line, so newlines survive — bounded on both axes */
const logoText = v => {
  if (typeof v !== 'string') return 'prmpt.bio';
  return v.replace(/\r\n?/g, '\n').split('\n').slice(0, 12).join('\n').slice(0, 200);
};

/**
 * Links are user input — a hand-edited or hostile one must not be able to allocate a
 * 100000px canvas, build ten thousand glyph meshes, or feed NaN into a transform.
 * Every field is coerced into the same range its control allows.
 */
function sanitize(o) {
  const px = Array.isArray(o.px) ? o.px : [];
  const L = o.L && typeof o.L === 'object' ? o.L : {};
  const K = o.K && typeof o.K === 'object' ? o.K : {};
  const li = Array.isArray(o.li) ? o.li : [];
  const gr = Array.isArray(o.gr) ? o.gr : [];
  const rd = Array.isArray(o.rd) ? o.rd : [];
  return {
    v: o.v,
    px: [Math.round(num(px[0], 64, 8000, 1600)), Math.round(num(px[1], 64, 8000, 2000))],
    bg: hex(o.bg, '#f8280c'),
    n: num(o.n, 0, 1, 0.06),
    g: num(o.g, 0.5, 8, 1.4),
    m: bool(o.m),
    L: {
      t: logoText(L.t), c: hex(L.c, '#080204'),
      s: num(L.s, 1, 30, 7), tr: num(L.tr, -0.1, 0.6, 0.06), ld: num(L.ld, 0.6, 2.5, 1.15),
      gl: num(L.gl, 0, 1, 0.88),
      rx: num(L.rx, -60, 60, 0), ry: num(L.ry, -60, 60, 0), rz: num(L.rz, -45, 45, 0),
      x: num(L.x, -4000, 4000, 0), y: num(L.y, -4000, 4000, -32),
      sd: Math.round(num(L.sd, 0, 96, 0)), on: bool(L.on)
    },
    K: {
      s: num(K.s, 5, 140, 44), d: Math.round(num(K.d, 1, 60, 14)),
      gp: Math.round(num(K.gp, 0, 40, 6)), bv: num(K.bv, 0, 1, 0.5), gl: num(K.gl, 0, 1, 0.55),
      rx: num(K.rx, -60, 60, 0), ry: num(K.ry, -60, 60, 0), rz: num(K.rz, -45, 45, 0),
      x: num(K.x, -4000, 4000, 0), y: num(K.y, -4000, 4000, 14),
      c: hex(K.c, '#251ef2'), ic: hex(K.ic, '#080204'), eb: bool(K.eb), on: bool(K.on)
    },
    li: [num(li[0], 0, 10, 3.4), num(li[1], 0, 10, 2.2), num(li[2], 0, 4, 1.5), num(li[3], -180, 180, -35)],
    gr: [bool(gr[0]), bool(gr[1]), num(gr[2], 1, 20, 5), bool(gr[3])],
    rd: [bool(rd[0]), Math.round(num(rd[1], 8, 512, 96)), num(rd[2], 0, 1, 0.5), num(rd[3], 0.25, 1, 1)],
    mp: o.mp === undefined ? 1 : (bool(o.mp) ? 1 : 0),
    an: typeof o.an === 'string' ? o.an.slice(0, 32) : null
  };
}

export function decodeShare(hash) {
  const raw = (hash || '').replace(/^#/, '');
  if (!raw) return null;
  const o = JSON.parse(fromB64u(raw));
  if (!o || typeof o !== 'object') throw new Error('not a share payload');
  if (o.v !== VERSION) throw new Error(`unsupported share version ${o.v}`);
  return sanitize(o);
}

/** gather everything that defines the look */
export function collect({ state, poster }) {
  return {
    v: VERSION,
    px: [state.px.w, state.px.h],
    bg: state.bg, n: r(state.noise, 3), g: r(state.grain, 2), m: state.mono ? 1 : 0,
    L: {
      t: state.logo.text, c: state.logo.color, s: r(state.logo.size), tr: r(state.logo.track, 3),
      ld: r(state.logo.lead), gl: r(state.logo.gloss),
      rx: r(state.logo.rx, 1), ry: r(state.logo.ry, 1), rz: r(state.logo.rz, 1),
      x: r(state.logo.x, 1), y: r(state.logo.y, 1), sd: state.logo.seed, on: state.logo.on ? 1 : 0
    },
    K: {
      s: r(state.key.size), d: state.key.depth, gp: state.key.gap, bv: r(state.key.bevel),
      gl: r(state.key.gloss), rx: r(state.key.rx, 1), ry: r(state.key.ry, 1), rz: r(state.key.rz, 1),
      x: r(state.key.x, 1), y: r(state.key.y, 1), c: state.key.color, ic: state.key.inkColor,
      eb: state.key.eyeBg ? 1 : 0, on: state.key.on ? 1 : 0
    },
    li: [r(poster.keyLight.intensity), r(poster.rimLight.intensity),
         r(poster.scene.environmentIntensity), r(state.lightAngle, 0)],
    gr: [state.grid.show ? 1 : 0, state.grid.snap ? 1 : 0, state.grid.step, state.grid.export ? 1 : 0],
    rd: [state.render.rt ? 1 : 0, state.render.samples, r(state.render.speckle, 2), r(state.render.scale, 2)],
    mp: state.matchPreview ? 1 : 0,
    an: state.anim || null
  };
}
