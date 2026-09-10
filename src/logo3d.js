import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const CAP = 4.5;                 // pilowlava 3d cap height in source units
const SPACE_ADVANCE = 2.2;

export class Logo3D {
  constructor() {
    this.index = null;
    this.cache = new Map();
    this.loader = new OBJLoader();
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0x0a0508, metalness: 1.0, roughness: 0.12,
      clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 1.6
    });
    this.group = new THREE.Group();
    this.missing = [];
  }

  async init() {
    this.index = await (await fetch('assets/glyphs/index.json')).json();
    return this;
  }

  variantsFor(ch) { return this.index[ch] || this.index[ch.toLowerCase()] || null; }

  async geometry(file) {
    if (this.cache.has(file)) return this.cache.get(file);
    const txt = await (await fetch('assets/glyphs/' + file)).text();
    const obj = this.loader.parse(txt);
    let geo = null;
    obj.traverse(c => { if (c.isMesh && !geo) geo = c.geometry; });
    geo.deleteAttribute('normal');
    geo.deleteAttribute('uv');
    geo = mergeVertices(geo, 1e-4);
    geo.computeVertexNormals();          // the meshes are subdivision cages: smooth them
    this.cache.set(file, geo);
    return geo;
  }

  /** build `text` as a centred group whose cap height is 1 unit; newlines start a new line */
  async build(text, { tracking = 0.06, leading = 1.15, seed = 0 } = {}) {
    const old = this.group;
    const group = new THREE.Group();
    this.missing = [];
    const lines = String(text).split('\n');
    let n = 0;                        // runs across the whole block: alternates keep varying line to line

    for (let li = 0; li < lines.length; li++) {
      const row = new THREE.Group();
      let x = 0;

      for (const ch of lines[li]) {
        const i = n++;
        if (ch === ' ') { x += SPACE_ADVANCE + tracking * CAP; continue; }
        const variants = this.variantsFor(ch);
        if (!variants) { this.missing.push(ch); continue; }
        const pick = variants[(seed + i * 7 + ch.charCodeAt(0)) % variants.length];
        const geo = await this.geometry(pick.file);
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.position.x = x;
        row.add(mesh);
        x += pick.w + tracking * CAP;
      }

      // each line is centred on its own axis (the block is centred as a whole below)
      const rc = new THREE.Box3().setFromObject(row).getCenter(new THREE.Vector3());
      row.children.forEach(m => { m.position.x -= rc.x; });
      row.position.y = -li * leading * CAP;   // every glyph sits on y=0, so this is baseline to baseline
      group.add(row);
    }

    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    group.children.forEach(r => { r.position.x -= c.x; r.position.y -= c.y; r.position.z -= c.z; });
    group.scale.setScalar(1 / CAP);

    old.parent?.add(group);
    old.parent?.remove(old);
    this.group = group;
    return group;
  }

  setGloss(v) {
    this.material.roughness = THREE.MathUtils.lerp(0.55, 0.03, v);
    this.material.clearcoat = THREE.MathUtils.lerp(0.0, 0.8, v);
    this.material.needsUpdate = true;
  }
}
