import * as THREE from 'three';

/**
 * Progressive path tracing for the objects only. The brand background stays a flat
 * raster pass underneath, so it keeps its exact hex and its background-only grain;
 * the traced objects are composited over it with their own coverage.
 */
export class RayTracer {
  constructor(poster) {
    this.poster = poster;
    this.pt = null;
    this.on = false;
    this.target = 96;
    this.premultiplied = true;   // verified against the accumulation buffer
    this.composite = null;
  }

  /** the tracer bundle is ~216 KB, so it is only fetched when ray-traced mode is first used */
  async init() {
    const { WebGLPathTracer } = await import('three-gpu-pathtracer');
    const renderer = this.poster.renderer;
    const pt = new WebGLPathTracer(renderer);
    pt.renderScale = 1;
    pt.dynamicLowRes = false;   // we composite ourselves, so its canvas fallback is unused
    pt.renderDelay = 0;
    pt.fadeDuration = 0;
    pt.minSamples = 1;
    // near-mirror metal against small bright softboxes throws specular fireflies —
    // isolated white specks that never average out however long you accumulate.
    // filterGlossyFactor roughens glossy lobes *after* the first bounce, so primary
    // reflections stay sharp while the paths that produce the specks are damped.
    pt.filterGlossyFactor = 0.5;
    pt.bounces = 6;                 // 10 buys nothing here and lengthens the noisy paths
    pt.renderToCanvas = false;    // we do our own compositing
    pt.textureSize = new THREE.Vector2(2048, 2048);
    this.pt = pt;

    this.composite = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uTex: { value: null }, uPremult: { value: 1 } },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,               // premultiplied source
        blendDst: THREE.OneMinusSrcAlphaFactor,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
        fragmentShader: `
          uniform sampler2D uTex; uniform float uPremult; varying vec2 vUv;
          void main(){
            vec4 c = texture2D(uTex, vUv);
            float a = clamp(c.a, 0.0, 1.0);
            // the tracer accumulates linear radiance; convert exactly like its own blit does
            vec3 lin = uPremult > 0.5 ? (a > 0.0 ? c.rgb / a : vec3(0.0)) : c.rgb;
            #if defined( TONE_MAPPING )
              lin = toneMapping(lin);      // match the raster path's highlight rolloff
            #endif
            vec3 outRGB = linearToOutputTexel(vec4(lin, 1.0)).rgb;
            gl_FragColor = vec4(outRGB * a, a);   // premultiplied for OneFactor blending
          }`
      })
    );
    // a 1x1 black background map: escaped camera rays then contribute no colour at all,
    // which is what makes the accumulated buffer true premultiplied coverage
    this.blackBg = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
    this.blackBg.mapping = THREE.EquirectangularReflectionMapping;
    this.blackBg.needsUpdate = true;

    this.compositeScene = new THREE.Scene();
    this.compositeScene.add(this.composite);
    this.compositeCamera = new THREE.Camera();
    return this;
  }

  get samples() { return this.pt ? Math.floor(this.pt.samples) : 0; }

  /** trade reflection sharpness against speckle; restarts accumulation */
  setSpeckleFilter(v) {
    if (!this.pt) return;
    this.pt.filterGlossyFactor = v;
    this.pt.reset();
  }
  get done() { return this.samples >= this.target; }

  /** (re)build the BVH and reset accumulation — call after any geometry or transform change */
  build(scene, camera) {
    if (!this.pt) return;
    this.pt.setScene(scene, camera);
    const mat = this.pt._pathTracer?.material;
    if (mat) {
      mat.backgroundMap = this.blackBg;   // don't paint the environment behind the objects
      mat.backgroundIntensity = 0;
      mat.backgroundAlpha = 0;            // escaped rays stay transparent
    }
  }

  reset(scene, camera) { this.build(scene, camera); }

  get compiling() { return !!this.pt?.isCompiling; }

  /** one progressive sample, composited over the brand background */
  renderSample() {
    const renderer = this.poster.renderer;
    this.pt.renderSample();
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.clear();
    this.poster.renderBackground();
    if (this.samples < 1) {
      // the tracer shader is still compiling: keep the raster preview on screen
      renderer.clearDepth();
      renderer.render(this.poster.scene, this.poster.camera);
    } else {
      this.composite.material.uniforms.uTex.value = this.pt.target.texture;
      this.composite.material.uniforms.uPremult.value = this.premultiplied ? 1 : 0;
      renderer.render(this.compositeScene, this.compositeCamera);
    }
    renderer.autoClear = prevAutoClear;
  }
}
