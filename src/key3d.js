import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const INK  = new THREE.Color('#080204');
const BLUE = new THREE.Color('#251ef2');
const RED  = new THREE.Color('#f8280c');

/** widen a shape's holes about their own centre, leaving the outer contour untouched */
function widenHoles(shape, k) {
  if (k === 1 || !shape.holes.length) return shape;
  shape.holes = shape.holes.map(h => {
    const pts = h.getPoints(96);
    const c = new THREE.Vector2();
    pts.forEach(p => c.add(p));
    c.divideScalar(pts.length);
    return new THREE.Path(pts.map(p => new THREE.Vector2(c.x + (p.x - c.x) * k, c.y + (p.y - c.y) * k)));
  });
  return shape;
}

function classify(fill) {
  const c = new THREE.Color(fill || '#000000');
  const d = t => (c.r - t.r) ** 2 + (c.g - t.g) ** 2 + (c.b - t.b) ** 2;
  const m = Math.min(d(INK), d(BLUE), d(RED));
  return m === d(INK) ? 'ink' : m === d(BLUE) ? 'blue' : 'eye';
}

export class Key3D {
  constructor() {
    this.svg = null;
    this.group = new THREE.Group();
    this.mat = {
      ink:  new THREE.MeshPhysicalMaterial({ color: INK.clone(),  metalness: 0.85, roughness: 0.18, envMapIntensity: 1.4 }),
      blue: new THREE.MeshPhysicalMaterial({ color: BLUE.clone(), metalness: 0.55, roughness: 0.22, envMapIntensity: 1.3 }),
      eye:  new THREE.MeshPhysicalMaterial({ color: RED.clone(),  metalness: 0.1,  roughness: 0.5,  envMapIntensity: 0.8 })
    };
  }

  async init(url) {
    const txt = await (await fetch(url)).text();
    this.svg = new SVGLoader().parse(txt);
    const vb = (this.svg.xml.getAttribute('viewBox') || '0 0 2048 2048').split(/[\s,]+/).map(Number);
    this.vbArea = vb[2] * vb[3];
    return this;
  }

  /** rebuild the extruded relief; depth/gap are in svg units */
  build({ depth = 84, gap = 36, bevel = 0.5 } = {}) {
    const old = this.group;
    const group = new THREE.Group();
    const flip = new THREE.Group();
    flip.rotation.x = Math.PI;           // svg y-down -> 3d y-up, without mirroring the winding
    group.add(flip);

    // pass 1 — collect the paths that belong to the mark
    const layers = [];
    this.hasEye = false;
    for (const path of this.svg.paths) {
      const shapes = SVGLoader.createShapes(path);
      if (!shapes.length) continue;

      // the artwork's own background plate covers the whole viewBox: skip it
      const b = new THREE.Box2();
      shapes.forEach(s => s.getPoints(6).forEach(p => b.expandByPoint(p)));
      const size = b.getSize(new THREE.Vector2());
      if (size.x * size.y > this.vbArea * 0.9) continue;

      const kind = classify(path.userData?.style?.fill);
      if (kind === 'eye') this.hasEye = true;
      layers.push({ shapes, kind });
    }

    // pass 2 — extrude. every cut layer carries the *same* hole outline, and the plates
    // interpenetrate, so those bore walls would be exactly coincident and z-fight. Widening
    // the bore slightly on the layers further back nests them instead: only the front bore
    // is ever visible, and the difference is far too small to read as a step.
    // The bevel is capped in absolute units too: scaled off `depth` it self-intersects on
    // this outline's tight concave curves and streaks the walls.
    const n = layers.length;
    const bSize = Math.min(depth * 0.06, 4) * bevel;
    const bThick = Math.min(depth * 0.08, 5) * bevel;
    layers.forEach((L, i) => {
      const shapes = L.shapes.map(sh => widenHoles(sh, 1 + (n - i) * 0.004));
      let geo = new THREE.ExtrudeGeometry(shapes, {
        depth,
        bevelEnabled: bevel > 0.001,
        bevelThickness: bThick,
        bevelSize: bSize,
        bevelSegments: 3,
        curveSegments: 24
      });
      // extruded side walls get one flat normal per segment, which reads as hard specular
      // banding on glossy metal. Smooth across the shallow seams, keep the real edges sharp.
      geo = toCreasedNormals(geo, THREE.MathUtils.degToRad(35));
      const mesh = new THREE.Mesh(geo, this.mat[L.kind]);
      mesh.position.z = -i * gap;        // rotated by pi -> later layers sit toward the viewer
      mesh.userData.kind = L.kind;
      flip.add(mesh);
    });

    // normalise: cap height 1 unit, centred on origin
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    const h = box.getSize(new THREE.Vector3()).y || 1;
    flip.children.forEach(m => { m.position.x -= c.x; m.position.y += c.y; m.position.z += c.z; });
    group.scale.setScalar(1 / h);

    old.parent?.add(group);
    old.parent?.remove(old);
    old.traverse(o => o.isMesh && o.geometry.dispose());
    this.group = group;
    return group;
  }

  setGloss(v) {
    this.mat.ink.roughness  = THREE.MathUtils.lerp(0.6, 0.04, v);
    this.mat.blue.roughness = THREE.MathUtils.lerp(0.65, 0.06, v);
    this.mat.ink.metalness  = THREE.MathUtils.lerp(0.3, 1.0, v);
    this.mat.blue.metalness = THREE.MathUtils.lerp(0.15, 0.8, v);
  }

  setEyeColor(hex) { this.mat.eye.color.set(hex); }
}
