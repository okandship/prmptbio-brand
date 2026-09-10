import * as THREE from 'three';
import { studioEquirect } from './studioenv.js';

export const POSTER_H = 100;            // poster height in world units; width = 100 * aspect

const BG_VERT = `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BG_FRAG = `
uniform vec3  uColor;
uniform float uAmount;
uniform float uCell;
uniform float uMono;
varying vec2 vUv;
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
void main(){
  vec2 cell = floor(gl_FragCoord.xy / max(uCell, 0.5));
  vec3 g = uMono > 0.5
    ? vec3(hash(cell))
    : vec3(hash(cell), hash(cell + 11.7), hash(cell + 23.3));
  vec3 col = uColor + (g - 0.5) * uAmount;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Poster {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance'
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Khronos PBR Neutral: rolls specular highlights off smoothly instead of clipping them
    // to hard white blobs, while leaving saturated colours far closer to true than ACES.
    // The background is a raw ShaderMaterial that never calls toneMapping(), so the brand
    // hex still exports exactly.
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.autoClear = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-50, 50, 50, -50, -5000, 5000);
    this.camera.position.set(0, 0, 1000);
    this.camera.lookAt(0, 0, 0);

    // ---- background pass -------------------------------------------------
    this.bgScene = new THREE.Scene();
    this.bgCamera = new THREE.Camera();
    this.bgUniforms = {
      uColor:  { value: new THREE.Color().setStyle('#f8280c', THREE.LinearSRGBColorSpace) },
      uAmount: { value: 0.06 },
      uCell:   { value: 1.4 },
      uMono:   { value: 1 }
    };
    this.bgMat = new THREE.ShaderMaterial({
      uniforms: this.bgUniforms, vertexShader: BG_VERT, fragmentShader: BG_FRAG,
      depthTest: false, depthWrite: false, toneMapped: false
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    // ---- environment + lights -------------------------------------------
    // one studio map, two consumers: PMREM for the raster path, the raw equirect for the tracer
    this.envEquirect = studioEquirect(768);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envPMREM = pmrem.fromEquirectangular(this.envEquirect);
    this.scene.environment = this.envPMREM.texture;
    this.scene.environmentIntensity = 1.5;
    pmrem.dispose();

    this.ambient = new THREE.AmbientLight(0xffffff, 0.45);
    this.keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
    this.rimLight = new THREE.DirectionalLight(0xffffff, 2.2);
    this.scene.add(this.ambient, this.keyLight, this.rimLight);
    this.setLightAngle(-35);

    this.grainPx = 1.4;
    this.matchPreview = true;      // exports reproduce the on-screen look, chunk for chunk
    this.previewPx = null;
    this.posterPx = { w: 1600, h: 2000 };
    this.bufferPx = { w: 1600, h: 2000 };
  }

  setLightAngle(deg) {
    const a = THREE.MathUtils.degToRad(deg);
    this.keyLight.position.set(Math.cos(a) * 220, Math.sin(a) * 220, 320);
    this.rimLight.position.set(Math.cos(a + Math.PI * 0.85) * 260, Math.sin(a + Math.PI * 0.85) * 200, 160);
  }

  get aspect() { return this.posterPx.w / this.posterPx.h; }
  get posterW() { return POSTER_H * this.aspect; }

  /** poster pixel dimensions (what export produces) */
  setPosterSize(w, h) {
    this.posterPx = { w, h };
    const halfW = this.posterW / 2, halfH = POSTER_H / 2;
    this.camera.left = -halfW; this.camera.right = halfW;
    this.camera.top = halfH;   this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** css size of the on-screen canvas; drawing buffer follows dpr (capped) */
  setDisplaySize(cssW, cssH) {
    cssW = Math.max(1, Math.round(cssW)); cssH = Math.max(1, Math.round(cssH));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(cssW, cssH, true);
    this.bufferPx = { w: Math.round(cssW * dpr), h: Math.round(cssH * dpr) };
    this.previewPx = { ...this.bufferPx };   // what "matches the preview" refers to
  }

  /** the flat brand ground + grain, on its own so the tracer can composite over it */
  /** grain cell in buffer pixels — see `matchPreview` */
  grainCell() {
    const natural = Math.max(1, this.grainPx * this.bufferPx.h / this.posterPx.h);
    if (!this.matchPreview || !this.previewPx) return natural;
    // the preview canvas is far smaller than the poster, so its grain clamps to one device
    // pixel and reads much coarser. Reproduce that *relative* size at export resolution.
    const previewCell = Math.max(1, this.grainPx * this.previewPx.h / this.posterPx.h);
    return previewCell * this.bufferPx.h / this.previewPx.h;
  }

  renderBackground() {
    this.bgUniforms.uCell.value = this.grainCell();
    this.renderer.render(this.bgScene, this.bgCamera);
  }

  /** the path tracer needs a real equirect; the raster path needs the PMREM */
  useEquirectEnv(on) {
    this.scene.environment = on ? this.envEquirect : this.envPMREM.texture;
  }

  render() {
    this.renderer.clear();
    this.renderBackground();
    this.renderer.clearDepth();
    this.renderer.render(this.scene, this.camera);
  }

  /** rgba -> real png-24 (colour type 2, no alpha channel) */
  static async encodePNG24(rgba, w, h) {
    const stride = w * 3;
    const raw = new Uint8Array((stride + 1) * h);
    let o = 0;
    for (let y = 0; y < h; y++) {
      raw[o++] = 0;                                   // filter: none
      let i = y * w * 4;
      for (let x = 0; x < w; x++) { raw[o++] = rgba[i]; raw[o++] = rgba[i + 1]; raw[o++] = rgba[i + 2]; i += 4; }
    }
    if (typeof CompressionStream === 'undefined') throw new Error('CompressionStream unavailable');
    const zlib = new Uint8Array(await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer());

    const TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      TABLE[n] = c >>> 0;
    }
    const crc32 = bytes => {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    };
    const chunk = (type, data) => {
      const body = new Uint8Array(4 + data.length);
      for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
      body.set(data, 4);
      const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
      dv.setUint32(0, data.length);
      out.set(body, 4);
      dv.setUint32(8 + data.length, crc32(body));
      return out;
    };
    const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type 2 = truecolour, no alpha  -> png-24
    return new Blob([
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))
    ], { type: 'image/png' });
  }

  /** render at full poster pixels and return an opaque PNG-24 blob.
   *  `overlay(ctx, w, h)` may paint on top of the frame before it is encoded. */
  async exportPNG(overlay = null) {
    const canvas = this.renderer.domElement;
    const prevPR = this.renderer.getPixelRatio();
    const prev = this.renderer.getSize(new THREE.Vector2());   // survives a collapsed/hidden stage
    const prevW = Math.max(1, Math.round(prev.x)), prevH = Math.max(1, Math.round(prev.y));
    const { w, h } = this.posterPx;

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.bufferPx = { w, h };
    this.render();

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d', { alpha: false });
    ctx.drawImage(canvas, 0, 0);
    overlay?.(ctx, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;

    this.renderer.setPixelRatio(prevPR);
    this.renderer.setSize(prevW, prevH, true);
    this.bufferPx = { w: Math.round(prevW * prevPR), h: Math.round(prevH * prevPR) };
    this.render();
    return Poster.encodePNG24(rgba, w, h);
  }
}
