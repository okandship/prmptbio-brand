import * as THREE from 'three';
import { POSTER_H } from './poster.js';

/**
 * Paint the grid + centre axes in white at any resolution. The caller sets the
 * blend mode: the live overlay differences it against the art, and so do exports.
 */
export function paintGrid(ctx, pxW, pxH, posterW, step, lineWidth = 1) {
  const u2px = x => (x + posterW / 2) / posterW * pxW;
  const v2py = y => (POSTER_H / 2 - y) / POSTER_H * pxH;
  const half = posterW / 2;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  for (let x = -Math.floor(half / step) * step; x <= half; x += step) {
    const px = Math.round(u2px(x)) + 0.5;
    ctx.moveTo(px, 0); ctx.lineTo(px, pxH);
  }
  for (let y = -50; y <= 50; y += step) {
    const py = Math.round(v2py(y)) + 0.5;
    ctx.moveTo(0, py); ctx.lineTo(pxW, py);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.moveTo(Math.round(u2px(0)) + 0.5, 0); ctx.lineTo(Math.round(u2px(0)) + 0.5, pxH);
  ctx.moveTo(0, Math.round(v2py(0)) + 0.5); ctx.lineTo(pxW, Math.round(v2py(0)) + 0.5);
  ctx.stroke();
}

export class Interact {
  constructor(poster, view, overlay, overlayInv) {
    this.poster = poster;
    this.view = view;
    this.overlay = overlay;
    this.overlayInv = overlayInv;
    this.ctx = overlay.getContext('2d');
    this.ctxInv = overlayInv.getContext('2d');
    this.items = [];                 // {name, root, label}
    this.selected = null;
    this.gridStep = 5;
    this.snap = true;
    this.showGrid = true;
    this.guides = [];
    this.onChange = () => {};
    this.onResize = () => {};
    this.onSelect = () => {};
    this.ray = new THREE.Raycaster();
    this.drag = null;
    this.resizing = null;
    this.HANDLE = 5;          // half-size of a corner handle, css px
    this.GRAB = 11;           // hit radius for grabbing one
    this._bind();
  }

  _capture(id, on) { try { on ? this.view.setPointerCapture(id) : this.view.releasePointerCapture(id); } catch {} }

  add(name, root, label, limits = { min: 0.05, max: 1000 }) {
    this.items.push({ name, root, label, limits });
  }
  itemOf(name) { return this.items.find(i => i.name === name); }

  // ---- coordinate helpers ------------------------------------------------
  get css() { return { w: this.view.clientWidth, h: this.view.clientHeight }; }
  u2px(x) { return (x + this.poster.posterW / 2) / this.poster.posterW * this.css.w; }
  v2py(y) { return (POSTER_H / 2 - y) / POSTER_H * this.css.h; }
  ptr2u(e) {
    const r = this.view.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * this.poster.posterW - this.poster.posterW / 2,
      y: POSTER_H / 2 - (e.clientY - r.top) / r.height * POSTER_H
    };
  }

  hit(e) {
    const r = this.view.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    this.ray.setFromCamera(ndc, this.poster.camera);
    let best = null;
    for (const it of this.items) {                 // pick whatever is actually in front
      if (!it.root.visible) continue;
      const ix = this.ray.intersectObject(it.root, true);
      if (ix.length && (!best || ix[0].distance < best.d)) best = { it, d: ix[0].distance };
    }
    return best ? best.it : null;
  }

  /** screen-space corners of the selection, each with its opposite anchor */
  corners() {
    if (!this.selected || !this.selected.root.visible) return [];
    const box = new THREE.Box3().setFromObject(this.selected.root);
    if (!isFinite(box.min.x) || box.max.x - box.min.x < 1e-6) return [];
    const L = box.min.x, R = box.max.x, B = box.min.y, T = box.max.y;
    return [
      { id: 'tl', ux: L, uy: T, ax: R, ay: B, cur: 'nwse-resize' },
      { id: 'tr', ux: R, uy: T, ax: L, ay: B, cur: 'nesw-resize' },
      { id: 'bl', ux: L, uy: B, ax: R, ay: T, cur: 'nesw-resize' },
      { id: 'br', ux: R, uy: B, ax: L, ay: T, cur: 'nwse-resize' }
    ].map(c => ({ ...c, px: this.u2px(c.ux), py: this.v2py(c.uy) }));
  }

  handleAt(e) {
    const r = this.view.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    for (const c of this.corners()) {
      if (Math.abs(mx - c.px) <= this.GRAB && Math.abs(my - c.py) <= this.GRAB) return c;
    }
    return null;
  }

  select(name) {
    this.selected = name ? this.itemOf(name) : null;
    this.onSelect(this.selected);
    this.draw();
  }

  _bind() {
    this.view.addEventListener('pointerdown', e => {
      const h = this.handleAt(e);
      if (h) {                                   // resize from a corner
        const p = this.ptr2u(e);
        const root = this.selected.root;
        this.resizing = {
          anchor: { x: h.ax, y: h.ay },
          corner: { x: h.ux - h.ax, y: h.uy - h.ay },   // anchor -> dragged corner
          grab:   { x: p.x - h.ux,  y: p.y - h.uy },    // pointer offset within the handle
          size0:  root.scale.x,
          pos0:   { x: root.position.x, y: root.position.y }
        };
        this._capture(e.pointerId, true);
        this.view.style.cursor = h.cur;
        return;
      }
      const it = this.hit(e);
      this.select(it ? it.name : null);
      if (!it) return;
      const p = this.ptr2u(e);
      this.drag = { dx: it.root.position.x - p.x, dy: it.root.position.y - p.y };
      this._capture(e.pointerId, true);
      this.view.style.cursor = 'grabbing';
    });

    this.view.addEventListener('pointermove', e => {
      if (this.resizing && this.selected) {
        const R = this.resizing, root = this.selected.root, lim = this.selected.limits;
        const p = this.ptr2u(e);
        const cx = p.x - R.grab.x - R.anchor.x;   // where the corner wants to be
        const cy = p.y - R.grab.y - R.anchor.y;
        const len2 = R.corner.x ** 2 + R.corner.y ** 2;
        let f = (cx * R.corner.x + cy * R.corner.y) / len2;   // project onto the diagonal
        this.guides = [];
        if (this.snap && Math.abs(R.corner.x) > 1e-4) {       // land the corner on a grid line
          const snapped = Math.round((R.anchor.x + R.corner.x * f) / this.gridStep) * this.gridStep;
          f = (snapped - R.anchor.x) / R.corner.x;
        }
        f = THREE.MathUtils.clamp(f, lim.min / R.size0, lim.max / R.size0);
        if (!isFinite(f) || f <= 0) return;
        root.scale.setScalar(R.size0 * f);
        root.position.x = R.anchor.x + (R.pos0.x - R.anchor.x) * f;
        root.position.y = R.anchor.y + (R.pos0.y - R.anchor.y) * f;
        this.onResize(this.selected.name, R.size0 * f);
        this.draw();
        return;
      }
      if (!this.drag || !this.selected) {
        const h = this.handleAt(e);
        this.view.style.cursor = h ? h.cur : (this.hit(e) ? 'grab' : 'default');
        return;
      }
      const p = this.ptr2u(e);
      let x = p.x + this.drag.dx, y = p.y + this.drag.dy;
      this.guides = [];
      if (this.snap) {
        x = Math.round(x / this.gridStep) * this.gridStep;
        y = Math.round(y / this.gridStep) * this.gridStep;
        if (Math.abs(x) <= this.gridStep * 0.51) { x = 0; this.guides.push(['v', 0]); }
        if (Math.abs(y) <= this.gridStep * 0.51) { y = 0; this.guides.push(['h', 0]); }
      }
      this.selected.root.position.x = x;
      this.selected.root.position.y = y;
      this.onChange();
      this.draw();
    });

    const end = e => {
      if (!this.drag && !this.resizing) return;
      this.drag = null;
      this.resizing = null;
      this.guides = [];
      this._capture(e.pointerId, false);
      this.view.style.cursor = 'default';
      this.onChange();
      this.draw();
    };
    this.view.addEventListener('pointerup', end);
    this.view.addEventListener('pointercancel', end);

    window.addEventListener('keydown', e => {
      if (e.target.matches('input, select, textarea')) return;
      if (e.key === 'Escape') return this.select(null);
      if (!this.selected) return;
      const step = e.shiftKey ? 1 : this.gridStep;
      const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      this.selected.root.position.x += d[0];
      this.selected.root.position.y += d[1];
      this.onChange();
      this.draw();
    });
  }

  // ---- overlay -----------------------------------------------------------
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = this.css;
    for (const [cv, cx] of [[this.overlay, this.ctx], [this.overlayInv, this.ctxInv]]) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = w + 'px';
      cv.style.height = h + 'px';
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.draw();
  }

  draw() {
    const { w, h } = this.css;
    const g = this.ctx;
    const gi = this.ctxInv;      // white here reads as an inversion of the art beneath
    g.clearRect(0, 0, w, h);
    gi.clearRect(0, 0, w, h);

    if (this.showGrid) {
      paintGrid(gi, w, h, this.poster.posterW, this.gridStep, 1);
    }

    for (const [kind, at] of this.guides) {
      gi.strokeStyle = '#ffffff';          // full inversion: never lost against its own ground
      gi.lineWidth = 1.5;
      gi.beginPath();
      if (kind === 'v') { const px = Math.round(this.u2px(at)) + 0.5; gi.moveTo(px, 0); gi.lineTo(px, h); }
      else { const py = Math.round(this.v2py(at)) + 0.5; gi.moveTo(0, py); gi.lineTo(w, py); }
      gi.stroke();
    }

    if (this.selected && this.selected.root.visible) {
      const box = new THREE.Box3().setFromObject(this.selected.root);
      const x0 = this.u2px(box.min.x), x1 = this.u2px(box.max.x);
      const y0 = this.v2py(box.max.y), y1 = this.v2py(box.min.y);
      g.strokeStyle = '#251ef2';
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);
      g.setLineDash([]);
      const k = this.HANDLE;
      for (const c of this.corners()) {
        g.fillStyle = '#ffffff';
        g.fillRect(c.px - k, c.py - k, k * 2, k * 2);
        g.strokeStyle = '#251ef2';
        g.lineWidth = 1.5;
        g.strokeRect(c.px - k, c.py - k, k * 2, k * 2);
      }
      g.fillStyle = '#fff';
      g.font = '11px ui-monospace, monospace';
      g.fillText(this.selected.label, x0, Math.max(12, y0 - 6));
    }
  }
}
