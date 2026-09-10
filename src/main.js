import * as THREE from 'three';
import { Poster, POSTER_H } from './poster.js';
import { Logo3D } from './logo3d.js';
import { Key3D } from './key3d.js';
import { Interact, paintGrid } from './interact.js';
import { RayTracer } from './raytrace.js';
import { ANIMATIONS, Player } from './animate.js';
import { exportAnimationMP4, videoUnsupported } from './video.js';
import { encodeShare, decodeShare, collect } from './share.js';

const $ = s => document.querySelector(s);
const view = $('#view'), overlay = $('#overlay'), overlayInv = $('#overlay-inv');

const BRAND = { red: '#f8280c', blue: '#251ef2', ink: '#080204', paper: '#ffffff' };

const state = {
  px: { w: 1600, h: 2000 },
  bg: BRAND.red,
  noise: 0.06, grain: 1.4, mono: true,
  lightAngle: -35,
  grid: { show: true, snap: true, step: 5, export: false },
  matchPreview: true,
  anim: 'drop',
  render: { rt: false, samples: 96, speckle: 0.5, scale: 1 },
  logo: { text: 'prmpt.bio', color: '#080204', size: 7, track: 0.06, lead: 1.15, gloss: 0.88, rx: 0, ry: -10, rz: 0, on: true, seed: 0, x: 0, y: -32 },
  key:  { size: 44, depth: 14, gap: 6, bevel: 0.5, gloss: 0.55, color: '#251ef2', inkColor: '#080204', rx: 8, ry: -18, rz: 0, on: true, eyeBg: true, x: 0, y: 14 }
};

const poster = new Poster(view);
const logo3d = new Logo3D();
const key3d = new Key3D();
const logoRoot = new THREE.Group();
const keyRoot = new THREE.Group();
poster.scene.add(logoRoot, keyRoot);

const rt = new RayTracer(poster);
let dirty = true, rtDirty = true, rtCompose = false;
const invalidate = () => { dirty = true; rtDirty = true; };      // geometry/transform changed
const invalidateBg = () => { dirty = true; rtCompose = true; };  // ground only: no need to re-trace

const ui = new Interact(poster, view, overlay, overlayInv);
ui.add('key', keyRoot, 'key', { min: 5, max: 140 });
ui.add('logo', logoRoot, 'logotype', { min: 1, max: 30 });
ui.onChange = () => { syncSelFields(); invalidate(); };
ui.onSelect = sel => {
  $('#sel-none').hidden = !!sel;
  $('#sel-fields').hidden = !sel;
  syncSelFields();
};
ui.onResize = (name, size) => {
  const s = state[name];
  s.size = size;
  const id = name === 'logo' ? '#logo-size' : '#key-size';
  $(id).value = size.toFixed(1);
  $(id + '-o').textContent = size.toFixed(1);
  syncSelFields();          // the anchor stays put, so the centre moved too
  invalidate();
};

function syncSelFields() {
  if (!ui.selected) return;
  const s = state[ui.selected.name];
  s.x = ui.selected.root.position.x;
  s.y = ui.selected.root.position.y;
  $('#sel-x').value = s.x.toFixed(1);
  $('#sel-y').value = s.y.toFixed(1);
}

let animBgDirty = false;

/** read the current value of an animatable path */
function getParam(path) {
  const [a, b] = path.split('.');
  if (path === 'bg') return state.bg;
  if (path === 'noise') return state.noise;
  if (path === 'grain') return state.grain;
  if (a === 'light') {
    if (b === 'angle') return state.lightAngle;
    if (b === 'key') return poster.keyLight.intensity;
    if (b === 'rim') return poster.rimLight.intensity;
    if (b === 'env') return poster.scene.environmentIntensity;
  }
  if (a === 'key' || a === 'logo') return state[a][b];
  return 0;
}

/** write an animatable path; transforms are committed once per frame */
function setParam(path, v) {
  const [a, b] = path.split('.');
  if (path === 'bg')    { state.bg = v; animBgDirty = true; return; }
  if (path === 'noise') { state.noise = v; animBgDirty = true; return; }
  if (path === 'grain') { state.grain = v; animBgDirty = true; return; }
  if (a === 'light') {
    if (b === 'angle') { state.lightAngle = v; poster.setLightAngle(v); }
    else if (b === 'key') poster.keyLight.intensity = v;
    else if (b === 'rim') poster.rimLight.intensity = v;
    else if (b === 'env') poster.scene.environmentIntensity = v;
    return;
  }
  if (a === 'key' || a === 'logo') {
    state[a][b] = v;
    if (b === 'gloss') (a === 'key' ? key3d : logo3d).setGloss(v);
  }
}

/** zero all three axes for one object */
/** brand swatches plus a custom picker; returns a repaint fn for external state changes */
function buildSwatches(el, get, set) {
  let picker;
  const paint = () => {
    const cur = (get() || '').toLowerCase();
    [...el.querySelectorAll('.sw')].forEach(x => {
      if (x.dataset.hex) x.dataset.active = x.dataset.hex.toLowerCase() === cur ? '1' : '0';
    });
    if (picker) picker.value = get();
  };
  Object.entries(BRAND).forEach(([name, hex]) => {
    const b = document.createElement('button');
    b.className = 'sw';
    b.style.background = hex;
    b.title = `${name} ${hex}`;
    b.dataset.hex = hex;
    b.addEventListener('click', () => { set(hex); paint(); });
    el.appendChild(b);
  });
  picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'sw';
  picker.title = 'custom';
  picker.addEventListener('input', () => { set(picker.value); paint(); });
  el.appendChild(picker);
  paint();
  return paint;
}

let repaintSwatches = () => {};

/** the grid, painted into an export at its own resolution */
function gridOverlay(ctx, w, h) {
  if (!state.grid.export) return;
  ctx.save();
  ctx.globalCompositeOperation = 'difference';   // same inversion as the on-screen guides
  paintGrid(ctx, w, h, poster.posterW, state.grid.step, Math.max(1, Math.round(h / 900)));
  ctx.restore();
}

function resetRotation(name) {
  const o = state[name];
  o.rx = o.ry = o.rz = 0;
  ['rx', 'ry', 'rz'].forEach(k => {
    const el = $(`#${name}-${k}`);
    if (el) el.value = 0;
  });
  applyTransforms();
  ui.draw();
  invalidate();
}

function applyTransforms() {
  const L = state.logo, K = state.key;
  logoRoot.position.set(L.x, L.y, 0);
  logoRoot.scale.setScalar(L.size);
  logoRoot.rotation.set(THREE.MathUtils.degToRad(L.rx), THREE.MathUtils.degToRad(L.ry), THREE.MathUtils.degToRad(L.rz));
  logoRoot.visible = L.on;
  keyRoot.position.set(K.x, K.y, 0);
  keyRoot.scale.setScalar(K.size);
  keyRoot.rotation.set(THREE.MathUtils.degToRad(K.rx), THREE.MathUtils.degToRad(K.ry), THREE.MathUtils.degToRad(K.rz));
  keyRoot.visible = K.on;
}

/** float the logotype clear of the key's relief so it always occludes it */
function applyDepthOrder() {
  keyRoot.position.z = 0;
  logoRoot.position.z = 0;
  keyRoot.updateMatrixWorld(true);
  logoRoot.updateMatrixWorld(true);
  const kb = new THREE.Box3().setFromObject(keyRoot);
  const lb = new THREE.Box3().setFromObject(logoRoot);
  if (kb.isEmpty() || lb.isEmpty()) return;
  const shift = (kb.max.z - lb.min.z) + 1;      // 1 unit of clearance
  if (shift > 0) logoRoot.position.z = shift;   // ortho camera: z is occlusion only, never scale
}

function applyBackground() {
  poster.bgUniforms.uColor.value.setStyle(state.bg, THREE.LinearSRGBColorSpace);
  poster.bgUniforms.uAmount.value = state.noise;
  poster.bgUniforms.uMono.value = state.mono ? 1 : 0;
  poster.grainPx = state.grain;
  if (state.key.eyeBg) key3d.setEyeColor(state.bg);
  invalidateBg();
}

/**
 * Push state.render into the tracer and the panel. The tracer object only exists once
 * ray-traced mode has been entered, so speckle and scale are held in state and applied
 * here — otherwise moving those two sliders in draft mode would be silently dropped.
 */
function applyRenderState() {
  const rd = state.render;
  rt.target = rd.samples;
  if (rt.pt) {
    rt.pt.filterGlossyFactor = rd.speckle;
    rt.pt.renderScale = rd.scale;
    rt.pt.reset();
  }
  $('#rt-samples').value = rd.samples;  $('#rt-samples-o').textContent = rd.samples;
  $('#rt-speckle').value = rd.speckle;  $('#rt-speckle-o').textContent = rd.speckle.toFixed(2);
  $('#rt-scale').value = rd.scale;      $('#rt-scale-o').textContent = rd.scale;
  rtDirty = true;
}

async function setMode(on) {
  if (on && !rt.pt) {
    $('#rt-status').textContent = 'loading tracer…';
    try {
      await rt.init();
    } catch (err) {
      $('#rt-status').textContent = 'tracer failed to load: ' + err.message;
      return;
    }
    applyRenderState();   // the tracer boots on its own defaults; state is the truth
  }
  $('#mode-draft').classList.toggle('on', !on);
  $('#mode-rt').classList.toggle('on', on);
  state.render.rt = on;
  if (on) {
    poster.useEquirectEnv(true);
    rtDirty = true;
  } else {
    rt.on = false;
    poster.useEquirectEnv(false);
    $('#rt-status').textContent = 'raster preview';
    dirty = true;
  }
  rt.on = on;
}

function rtStatus() {
  const s = rt.samples, t = rt.target;
  $('#rt-status').textContent = rt.compiling ? 'compiling tracer…'
    : s >= t ? `converged · ${t} samples` : `sampling ${s} / ${t}`;
}

const player = new Player({
  snapshot: paths => Object.fromEntries(paths.map(p => [p, getParam(p)])),
  apply: setParam,
  commit: () => {
    applyTransforms();
    if (animBgDirty) { applyBackground(); animBgDirty = false; }
    ui.draw();
    invalidate();
  },
  onTick: (u, elapsed, dur) => {
    $('#anim-bar').style.width = (u * 100).toFixed(1) + '%';
    $('#anim-status').textContent = `${elapsed.toFixed(1)} / ${dur.toFixed(1)}s`;
  },
  onEnd: () => {
    $('#anim-play').textContent = 'play';
    $('#anim-play').classList.remove('playing');
    $('#anim-status').textContent = 'stopped';
    $('#anim-bar').style.width = '0%';
    syncAll();
  }
});

function toggleAnimation() {
  if (player.playing) { player.stop(); return; }
  if (rt.on) setMode(false);         // the tracer restarts on every change; animate in draft
  const anim = ANIMATIONS.find(a => a.id === $('#anim-select').value) || ANIMATIONS[0];
  player.loop = $('#anim-loop').checked;
  player.play(anim, performance.now() / 1000);
  $('#anim-play').textContent = 'stop';
  $('#anim-play').classList.add('playing');
}

function fit() {
  const box = $('#stage-inner');
  const pad = 52;
  const availW = box.clientWidth - pad, availH = box.clientHeight - pad;
  poster.setPosterSize(state.px.w, state.px.h);
  $('#dims').textContent = `${state.px.w} × ${state.px.h} px`;
  // the pane can collapse (hidden tab, dragged divider): keep the last good display size
  if (availW < 40 || availH < 40) { invalidate(); return; }
  const aspect = state.px.w / state.px.h;
  let w = availW, h = w / aspect;
  if (h > availH) { h = availH; w = h * aspect; }
  poster.setDisplaySize(Math.round(w), Math.round(h));
  ui.resize();
  invalidate();
}

let logoTimer = null;
function rebuildLogoDebounced() {
  clearTimeout(logoTimer);
  logoTimer = setTimeout(rebuildLogo, 120);
}
async function rebuildLogo() {
  await logo3d.build(state.logo.text, { tracking: state.logo.track, leading: state.logo.lead, seed: state.logo.seed });
  applyTransforms(); ui.draw(); invalidate();
  $('#export-note').textContent = logo3d.missing.length
    ? `no 3d glyph for: ${[...new Set(logo3d.missing)].join(' ')}`
    : 'exports at full canvas pixels, no alpha';
}

let keyTimer = null;
function rebuildKeyDebounced() {
  clearTimeout(keyTimer);
  keyTimer = setTimeout(rebuildKey, 90);
}
function rebuildKey() {
  key3d.build({ depth: state.key.depth * 6, gap: state.key.gap * 6, bevel: state.key.bevel });
  // the mark carries a real hole, so there may be no disc to tint
  $('#eye-bg').closest('label').hidden = !key3d.hasEye;
  applyTransforms(); ui.draw(); invalidate();
}

// ---- controls -------------------------------------------------------------
function slider(id, out, obj, prop, after, fmt = v => v) {
  const el = $(id), o = out ? $(out) : null;
  el.value = obj[prop];
  if (o) o.textContent = fmt(obj[prop]);
  el.addEventListener('input', () => {
    obj[prop] = parseFloat(el.value);
    if (o) o.textContent = fmt(obj[prop]);
    after?.();
  });
}
function check(id, obj, prop, after) {
  const el = $(id);
  el.checked = obj[prop];
  el.addEventListener('change', () => { obj[prop] = el.checked; after?.(); });
}

function wire() {
  // canvas
  $('#preset').addEventListener('change', e => {
    const v = e.target.value;
    const custom = v === 'custom';
    $('#custom-size').hidden = !custom;
    if (!custom) {
      const [w, h] = v.split('x').map(Number);
      state.px = { w, h };
      $('#cw').value = w; $('#ch').value = h;
    }
    fit();
  });
  const customSize = () => {
    state.px = {
      w: THREE.MathUtils.clamp(parseInt($('#cw').value) || 1600, 64, 8000),
      h: THREE.MathUtils.clamp(parseInt($('#ch').value) || 2000, 64, 8000)
    };
    fit();
  };
  $('#cw').addEventListener('change', customSize);
  $('#ch').addEventListener('change', customSize);

  $('#grid-on').addEventListener('change', e => { state.grid.show = ui.showGrid = e.target.checked; ui.draw(); });
  $('#grid-export').addEventListener('change', e => { state.grid.export = e.target.checked; });
  $('#match-preview').addEventListener('change', e => {
    state.matchPreview = poster.matchPreview = e.target.checked;
    invalidate();
  });
  $('#snap-on').addEventListener('change', e => { state.grid.snap = ui.snap = e.target.checked; });
  $('#grid-step').addEventListener('input', e => {
    state.grid.step = ui.gridStep = parseFloat(e.target.value);
    $('#grid-step-o').textContent = e.target.value;
    ui.draw();
  });

  const paintBg = buildSwatches($('#bg-swatches'), () => state.bg, v => { state.bg = v; applyBackground(); });
  const paintKey = buildSwatches($('#key-swatches'), () => state.key.color, v => {
    state.key.color = v; key3d.mat.blue.color.set(v); invalidate();
  });
  const paintInk = buildSwatches($('#ink-swatches'), () => state.key.inkColor, v => {
    state.key.inkColor = v; key3d.mat.ink.color.set(v); invalidate();
  });
  const paintLogo = buildSwatches($('#logo-swatches'), () => state.logo.color, v => {
    state.logo.color = v; logo3d.material.color.set(v); invalidate();
  });
  repaintSwatches = () => { paintBg(); paintKey(); paintInk(); paintLogo(); };

  slider('#noise', '#noise-o', state, 'noise', applyBackground, v => v.toFixed(2));
  slider('#grain', '#grain-o', state, 'grain', applyBackground, v => v.toFixed(1));
  check('#noise-mono', state, 'mono', applyBackground);

  // logotype
  $('#text').value = state.logo.text;
  $('#text').addEventListener('input', e => { state.logo.text = e.target.value; rebuildLogoDebounced(); });
  $('#shuffle').addEventListener('click', () => { state.logo.seed = (state.logo.seed + 1) % 97; rebuildLogo(); });
  $('#reset-logo').addEventListener('click', () => {
    Object.assign(state.logo, { size: 7, track: 0.06, lead: 1.15, rx: 0, ry: -10, rz: 0, x: 0, y: -32, seed: 0 });
    syncAll(); rebuildLogo();
  });
  slider('#logo-size', '#logo-size-o', state.logo, 'size', () => { applyTransforms(); ui.draw(); invalidate(); }, v => v.toFixed(1));
  slider('#logo-track', '#logo-track-o', state.logo, 'track', rebuildLogoDebounced, v => v.toFixed(2));
  slider('#logo-lead', '#logo-lead-o', state.logo, 'lead', rebuildLogoDebounced, v => v.toFixed(2));
  slider('#logo-gloss', '#logo-gloss-o', state.logo, 'gloss', () => { logo3d.setGloss(state.logo.gloss); invalidate(); }, v => v.toFixed(2));
  ['rx', 'ry', 'rz'].forEach(k => slider(`#logo-${k}`, null, state.logo, k, () => { applyTransforms(); ui.draw(); invalidate(); }));
  check('#logo-on', state.logo, 'on', () => { applyTransforms(); ui.draw(); invalidate(); });

  // key
  slider('#key-size', '#key-size-o', state.key, 'size', () => { applyTransforms(); ui.draw(); invalidate(); }, v => v.toFixed(1));
  slider('#key-depth', '#key-depth-o', state.key, 'depth', rebuildKeyDebounced, v => v.toFixed(0));
  slider('#key-gap', '#key-gap-o', state.key, 'gap', rebuildKeyDebounced, v => v.toFixed(0));
  slider('#key-bevel', '#key-bevel-o', state.key, 'bevel', rebuildKeyDebounced, v => v.toFixed(2));
  slider('#key-gloss', '#key-gloss-o', state.key, 'gloss', () => { key3d.setGloss(state.key.gloss); invalidate(); }, v => v.toFixed(2));
  ['rx', 'ry', 'rz'].forEach(k => slider(`#key-${k}`, null, state.key, k, () => { applyTransforms(); ui.draw(); invalidate(); }));
  check('#key-on', state.key, 'on', () => { applyTransforms(); ui.draw(); invalidate(); });
  check('#eye-bg', state.key, 'eyeBg', () => {
    key3d.setEyeColor(state.key.eyeBg ? state.bg : BRAND.red);
    invalidate();
  });

  // light
  slider('#l-key', '#l-key-o', { get v() { return poster.keyLight.intensity; }, set v(x) { poster.keyLight.intensity = x; } }, 'v', invalidate, v => v.toFixed(1));
  slider('#l-rim', '#l-rim-o', { get v() { return poster.rimLight.intensity; }, set v(x) { poster.rimLight.intensity = x; } }, 'v', invalidate, v => v.toFixed(1));
  slider('#l-env', '#l-env-o', { get v() { return poster.scene.environmentIntensity; }, set v(x) { poster.scene.environmentIntensity = x; } }, 'v', invalidate, v => v.toFixed(2));
  slider('#l-ang', '#l-ang-o', { get v() { return state.lightAngle; }, set v(x) { state.lightAngle = x; poster.setLightAngle(x); } }, 'v', invalidate, v => v.toFixed(0));

  // selected fields
  $('#sel-x').addEventListener('change', e => {
    if (!ui.selected) return;
    ui.selected.root.position.x = parseFloat(e.target.value) || 0;
    syncSelFields(); ui.draw(); invalidate();
  });
  $('#sel-y').addEventListener('change', e => {
    if (!ui.selected) return;
    ui.selected.root.position.y = parseFloat(e.target.value) || 0;
    syncSelFields(); ui.draw(); invalidate();
  });
  $('#center-h').addEventListener('click', () => {
    if (!ui.selected) return;
    ui.selected.root.position.x = 0; syncSelFields(); ui.draw(); invalidate();
  });
  $('#center-v').addEventListener('click', () => {
    if (!ui.selected) return;
    ui.selected.root.position.y = 0; syncSelFields(); ui.draw(); invalidate();
  });

  const animSel = $('#anim-select');
  ANIMATIONS.forEach(a => {
    const o = document.createElement('option');
    o.value = a.id;
    o.textContent = a.loop ? `${a.name} · loop` : a.name;
    animSel.appendChild(o);
  });
  const syncLoopBox = () => {
    const a = ANIMATIONS.find(x => x.id === animSel.value);
    $('#anim-loop').checked = !!(a && a.loop);        // each animation proposes its own default
    player.loop = $('#anim-loop').checked;
  };
  animSel.addEventListener('change', () => {
    state.anim = animSel.value;
    const wasPlaying = player.playing;
    if (wasPlaying) player.stop();
    syncLoopBox();
    if (wasPlaying) toggleAnimation();
  });
  syncLoopBox();
  $('#anim-play').addEventListener('click', toggleAnimation);
  $('#anim-loop').addEventListener('change', e => { player.loop = e.target.checked; player.loopThis = e.target.checked; });
  $('#anim-speed').addEventListener('input', e => {
    player.speed = parseFloat(e.target.value);
    $('#anim-speed-o').textContent = player.speed.toFixed(2) + '×';
  });

  $('#share-copy').addEventListener('click', async () => {
    const hash = encodeShare(collect({ state, poster }));
    history.replaceState(null, '', location.pathname + location.search + '#' + hash);
    const note = $('#export-note');
    try {
      await navigator.clipboard.writeText(location.href);
      note.textContent = `link copied · ${location.href.length} chars`;
    } catch {
      note.textContent = 'link is in the address bar (clipboard blocked)';
    }
    setTimeout(() => { note.textContent = 'exports at full canvas pixels, no alpha'; }, 4000);
  });

  window.addEventListener('hashchange', async () => {
    try {
      const o = decodeShare(location.hash);
      if (o) await applyShare(o);
    } catch (err) {
      $('#export-note').textContent = 'bad share link: ' + err.message;
    }
  });

  $('#anim-export').addEventListener('click', async () => {
    const btn = $('#anim-export');
    if (btn.dataset.busy) return;
    if (videoUnsupported()) { $('#anim-status').textContent = 'no video encoder in this browser'; return; }
    if (player.playing) player.stop();
    if (rt.on) setMode(false);
    const anim = ANIMATIONS.find(a => a.id === $('#anim-select').value) || ANIMATIONS[0];
    btn.dataset.busy = '1';
    btn.textContent = 'encoding…';
    try {
      const blob = await exportAnimationMP4({
        poster, player, anim,
        speed: player.speed,
        fps: parseInt($('#vid-fps').value),
        height: parseInt($('#vid-height').value),
        overlay: state.grid.export ? gridOverlay : null,
        onProgress: u => {
          $('#anim-bar').style.width = (u * 100).toFixed(1) + '%';
          $('#anim-status').textContent = `encoding ${(u * 100).toFixed(0)}%`;
        }
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = `prmpt-${anim.id}-${$('#vid-height').value}p-${stamp}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      $('#anim-status').textContent = `saved · ${(blob.size / 1048576).toFixed(1)} MB`;
    } catch (err) {
      console.error(err);
      $('#anim-status').textContent = 'export failed: ' + err.message;
    }
    $('#anim-bar').style.width = '0%';
    btn.textContent = 'export mp4';
    delete btn.dataset.busy;
    fit();
    syncAll();
  });

  $('#logo-rot-reset').addEventListener('click', () => resetRotation('logo'));
  $('#key-rot-reset').addEventListener('click', () => resetRotation('key'));

  $('#mode-draft').addEventListener('click', () => setMode(false));
  $('#mode-rt').addEventListener('click', () => setMode(true));
  $('#rt-speckle').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    state.render.speckle = v;
    $('#rt-speckle-o').textContent = v.toFixed(2);
    rt.setSpeckleFilter(v);
  });
  $('#rt-scale').addEventListener('input', e => {
    state.render.scale = parseFloat(e.target.value);
    $('#rt-scale-o').textContent = e.target.value;
    if (rt.pt) { rt.pt.renderScale = state.render.scale; rtDirty = true; }
  });
  $('#rt-samples').addEventListener('input', e => {
    state.render.samples = parseInt(e.target.value);
    rt.target = state.render.samples;
    $('#rt-samples-o').textContent = e.target.value;
    if (rt.on) rtStatus();
  });

  $('#export').addEventListener('click', () => {
    const btn = $('#export');
    btn.disabled = true; btn.textContent = 'rendering…';
    requestAnimationFrame(async () => {
      try {
        const blob = rt.on ? await exportRayTraced(btn) : await poster.exportPNG(gridOverlay);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        a.href = url;
        a.download = `prmpt-poster-${state.px.w}x${state.px.h}-${stamp}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch (err) {
        console.error(err);
        $('#export-note').textContent = 'export failed: ' + err.message;
      }
      btn.disabled = false; btn.textContent = 'export png-24';
    });
  });

  window.addEventListener('resize', fit);
}

/** accumulate a full-quality trace at export size, then encode png-24 */
async function exportRayTraced(btn) {
  const { w, h } = state.px;
  const prevPR = poster.renderer.getPixelRatio();
  const prevW = poster.renderer.domElement.clientWidth || 300;
  const prevH = poster.renderer.domElement.clientHeight || 150;
  const prevBuffer = { ...poster.bufferPx };
  const prevLowRes = rt.pt.dynamicLowRes;
  const prevScale = rt.pt.renderScale;

  // The canvas renders at full poster pixels — ground and grain stay crisp — while
  // `trace scale` decides how big the traced layer is, since the tracer's float
  // targets are what actually run out of memory. It is only clamped if the traced
  // buffer would exceed what a GPU will comfortably allocate.
  const MAX_TRACED = 2400;
  // "match preview" keeps the traced layer at the same *absolute* size it had on screen, so a
  // low trace scale exports with the same chunky blocks you were looking at. Otherwise the
  // scale is read against the poster, which traces far finer and smooths the blocks away.
  const wanted = (state.matchPreview && poster.previewPx)
    ? prevScale * poster.previewPx.w / w
    : prevScale;
  const eff = Math.min(wanted, MAX_TRACED / Math.max(w, h));

  rt.pt.dynamicLowRes = false;
  rt.pt.renderScale = eff;
  poster.renderer.setPixelRatio(1);
  poster.renderer.setSize(w, h, false);
  poster.bufferPx = { w, h };
  applyDepthOrder();
  rt.build(poster.scene, poster.camera);

  const traced = `${Math.round(w * eff)}×${Math.round(h * eff)}`;
  while (rt.samples < rt.target) {
    rt.renderSample();
    if (rt.samples % 4 === 0) {
      btn.textContent = `tracing ${rt.samples}/${rt.target} @ ${traced}`;
      await new Promise(r => setTimeout(r, 0));
    }
  }

  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d', { alpha: false });
  ctx.drawImage(poster.renderer.domElement, 0, 0);
  gridOverlay(ctx, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;

  rt.pt.dynamicLowRes = prevLowRes;
  rt.pt.renderScale = prevScale;
  poster.renderer.setPixelRatio(prevPR);
  poster.renderer.setSize(prevW, prevH, true);
  poster.bufferPx = prevBuffer;
  rtDirty = true;
  if (eff < prevScale - 1e-6) {
    $('#export-note').textContent = `traced at ${traced} (scale clamped to ${eff.toFixed(2)})`;
  }
  return Poster.encodePNG24(rgba, w, h);
}

function syncAll() {
  const set = (id, v, out, fmt = x => x) => {
    const el = $(id); if (!el) return;
    el.value = v;
    if (out && $(out)) $(out).textContent = fmt(v);
  };
  set('#logo-size', state.logo.size, '#logo-size-o', v => (+v).toFixed(1));
  set('#logo-track', state.logo.track, '#logo-track-o', v => (+v).toFixed(2));
  set('#logo-lead', state.logo.lead, '#logo-lead-o', v => (+v).toFixed(2));
  ['rx', 'ry', 'rz'].forEach(k => set(`#logo-${k}`, state.logo[k]));
  set('#key-size', state.key.size, '#key-size-o', v => (+v).toFixed(1));
  set('#key-gloss', state.key.gloss, '#key-gloss-o', v => (+v).toFixed(2));
  set('#logo-gloss', state.logo.gloss, '#logo-gloss-o', v => (+v).toFixed(2));
  set('#noise', state.noise, '#noise-o', v => (+v).toFixed(2));
  set('#grain', state.grain, '#grain-o', v => (+v).toFixed(1));
  set('#l-ang', state.lightAngle, '#l-ang-o', v => (+v).toFixed(0));
  ['rx', 'ry', 'rz'].forEach(k => set(`#key-${k}`, state.key[k]));
  applyTransforms();
}

/** push a decoded share payload into the app */
async function applyShare(o) {
  state.px = { w: o.px[0], h: o.px[1] };
  state.bg = o.bg; state.noise = o.n; state.grain = o.g; state.mono = !!o.m;
  Object.assign(state.logo, {
    text: o.L.t, color: o.L.c || '#080204', size: o.L.s, track: o.L.tr, lead: o.L.ld, gloss: o.L.gl,
    rx: o.L.rx, ry: o.L.ry, rz: o.L.rz, x: o.L.x, y: o.L.y, seed: o.L.sd, on: !!o.L.on
  });
  Object.assign(state.key, {
    size: o.K.s, depth: o.K.d, gap: o.K.gp, bevel: o.K.bv, gloss: o.K.gl,
    rx: o.K.rx, ry: o.K.ry, rz: o.K.rz, x: o.K.x, y: o.K.y,
    color: o.K.c, inkColor: o.K.ic, eyeBg: !!o.K.eb, on: !!o.K.on
  });
  poster.keyLight.intensity = o.li[0];
  poster.rimLight.intensity = o.li[1];
  poster.scene.environmentIntensity = o.li[2];
  state.lightAngle = o.li[3];
  poster.setLightAngle(state.lightAngle);
  state.grid = { show: !!o.gr[0], snap: !!o.gr[1], step: o.gr[2], export: !!o.gr[3] };
  state.matchPreview = o.mp === undefined ? true : !!o.mp;
  poster.matchPreview = state.matchPreview;
  ui.showGrid = state.grid.show; ui.snap = state.grid.snap; ui.gridStep = state.grid.step;
  if (o.an) state.anim = o.an;
  state.render = { rt: !!o.rd[0], samples: o.rd[1], speckle: o.rd[2], scale: o.rd[3] };

  key3d.mat.blue.color.set(state.key.color);
  key3d.mat.ink.color.set(state.key.inkColor);
  logo3d.material.color.set(state.logo.color);
  key3d.setGloss(state.key.gloss);
  logo3d.setGloss(state.logo.gloss);
  rebuildKey();
  await rebuildLogo();
  applyBackground();
  syncAll();
  syncShareControls();
  fit();
  applyRenderState();
  await setMode(state.render.rt);
}

/** controls that syncAll() doesn't already cover */
function syncShareControls() {
  $('#text').value = state.logo.text;
  $('#logo-track').value = state.logo.track;
  $('#logo-track-o').textContent = state.logo.track.toFixed(2);
  $('#key-depth').value = state.key.depth;   $('#key-depth-o').textContent = state.key.depth;
  $('#key-gap').value = state.key.gap;       $('#key-gap-o').textContent = state.key.gap;
  $('#key-bevel').value = state.key.bevel;   $('#key-bevel-o').textContent = state.key.bevel.toFixed(2);
  $('#logo-on').checked = state.logo.on;     $('#key-on').checked = state.key.on;
  $('#eye-bg').checked = state.key.eyeBg;
  $('#noise-mono').checked = state.mono;
  $('#grid-on').checked = state.grid.show;   $('#snap-on').checked = state.grid.snap;
  $('#grid-export').checked = !!state.grid.export;
  $('#match-preview').checked = !!state.matchPreview;
  poster.matchPreview = !!state.matchPreview;
  $('#grid-step').value = state.grid.step;   $('#grid-step-o').textContent = state.grid.step;
  $('#l-key').value = poster.keyLight.intensity;  $('#l-key-o').textContent = poster.keyLight.intensity.toFixed(1);
  $('#l-rim').value = poster.rimLight.intensity;  $('#l-rim-o').textContent = poster.rimLight.intensity.toFixed(1);
  $('#l-env').value = poster.scene.environmentIntensity;
  $('#l-env-o').textContent = poster.scene.environmentIntensity.toFixed(2);
  if ($('#anim-select')) $('#anim-select').value = state.anim;
  const preset = `${state.px.w}x${state.px.h}`;
  const sel = $('#preset');
  const known = [...sel.options].some(op => op.value === preset);
  sel.value = known ? preset : 'custom';
  $('#custom-size').hidden = known;
  $('#cw').value = state.px.w; $('#ch').value = state.px.h;
  repaintSwatches();
}

// ---- boot -----------------------------------------------------------------
(async function boot() {
  try {
    await logo3d.init();
    await key3d.init('assets/key.svg');
    logoRoot.add(logo3d.group);
    keyRoot.add(key3d.group);

    logo3d.setGloss(state.logo.gloss);
    key3d.setGloss(state.key.gloss);
    logo3d.material.color.set(state.logo.color);
    key3d.mat.blue.color.set(state.key.color);
    key3d.mat.ink.color.set(state.key.inkColor);
    rebuildKey();
    await rebuildLogo();

    wire();
    syncAll();
    applyBackground();
    fit();

    (function loop() {
      if (player.playing) player.update(performance.now() / 1000);
      if (rt.on) {
        if (rtDirty) {
          applyDepthOrder();
          rt.build(poster.scene, poster.camera);
          rtDirty = false; rtCompose = false;
          rtStatus();
        }
        if (!rt.done) { rt.renderSample(); rtStatus(); }
        else if (rtCompose) { rt.renderSample(); rtCompose = false; }
      } else if (dirty) {
        applyDepthOrder(); poster.render(); dirty = false;
      }
      requestAnimationFrame(loop);
    })();

    window.__studio = { poster, state, logo3d, key3d, ui, rt, player, ANIMATIONS, encodeShare, decodeShare, collect, applyShare, gridOverlay, exportRayTraced, invalidate, applyTransforms, applyDepthOrder, setMode, THREE, setRtDirty: v => { rtDirty = v; } };
    if (location.hash.length > 1) {
      try { const o = decodeShare(location.hash); if (o) await applyShare(o); }
      catch (err) { console.warn('share link ignored:', err.message); }
    }

    // deep-link a render mode, e.g. ?rt=1&samples=48 — routed through state so that a
    // share link copied afterwards carries what the query asked for.
    const q = new URLSearchParams(location.search);
    if (q.get('samples')) state.render.samples = Math.max(8, Math.min(512, parseInt(q.get('samples')) || 96));
    if (q.get('scale')) state.render.scale = Math.max(0.25, Math.min(1, parseFloat(q.get('scale')) || 1));
    if (q.get('samples') || q.get('scale')) applyRenderState();
    if (q.get('rt') === '1') await setMode(true);

    $('#loading').classList.add('done');
  } catch (err) {
    $('#loading').textContent = 'failed to start: ' + err.message;
    console.error(err);
  }
})();
