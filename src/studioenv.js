import * as THREE from 'three';

/**
 * A procedural studio equirectangular map, built as float data so it can feed both
 * the raster path (through PMREM) and the path tracer (which needs a real equirect).
 * Soft boxes rather than a room: glossy black metal lives or dies on its highlights.
 */
export function studioEquirect(width = 1024) {
  const height = width / 2;
  const data = new Float32Array(width * height * 4);

  // broad, soft boxes: sharp exponents here read as hard banded streaks once they
  // reflect off the glossy walls, which looks like a rendering artifact rather than light
  const boxes = [
    { dir: [-0.45,  0.80,  0.55], power: 7, gain: 3.0 },   // key, upper left
    { dir: [ 0.85,  0.25,  0.35], power: 5, gain: 1.3 },   // fill, right
    { dir: [ 0.10, -0.30, -0.95], power: 6, gain: 1.5 },   // rim, behind
    { dir: [ 0.00,  1.00,  0.00], power: 2, gain: 0.8 }    // broad top bounce
  ].map(b => {
    const [x, y, z] = b.dir, l = Math.hypot(x, y, z);
    return { ...b, dir: [x / l, y / l, z / l] };
  });

  const ZENITH = [0.55, 0.56, 0.60];
  const HORIZON = [0.20, 0.20, 0.22];
  const NADIR = [0.05, 0.05, 0.06];

  let i = 0;
  for (let py = 0; py < height; py++) {
    const theta = (py + 0.5) / height * Math.PI;
    const sT = Math.sin(theta), cT = Math.cos(theta);
    for (let px = 0; px < width; px++) {
      const phi = (px + 0.5) / width * Math.PI * 2 - Math.PI;
      const d = [sT * Math.sin(phi), cT, sT * Math.cos(phi)];

      const t = d[1];
      const base = t >= 0
        ? ZENITH.map((z, k) => HORIZON[k] + (z - HORIZON[k]) * Math.pow(t, 0.7))
        : HORIZON.map((h, k) => NADIR[k] + (h - NADIR[k]) * Math.pow(1 + t, 0.7));

      const rgb = [base[0], base[1], base[2]];
      for (const b of boxes) {
        const dot = d[0] * b.dir[0] + d[1] * b.dir[1] + d[2] * b.dir[2];
        if (dot > 0) {
          const v = Math.pow(dot, b.power) * b.gain;
          rgb[0] += v; rgb[1] += v; rgb[2] += v;
        }
      }
      data[i++] = rgb[0]; data[i++] = rgb[1]; data[i++] = rgb[2]; data[i++] = 1;
    }
  }

  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
