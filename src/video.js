/** H.264 profiles to try, most capable first; picked by what the browser reports it can do */
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f'];

async function pickCodec(width, height, fps, bitrate) {
  for (const codec of CODECS) {
    try {
      const { supported } = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate, framerate: fps });
      if (supported) return codec;
    } catch {}
  }
  return null;
}

export function videoUnsupported() {
  return typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined';
}

/**
 * Render the animation frame by frame and mux it into an MP4.
 * Deterministic: the timeline is sampled at exact frame times rather than captured
 * off the screen, so nothing drops and the duration is exact whatever the machine does.
 */
export async function exportAnimationMP4({
  poster, player, anim, speed = 1, fps = 30, height = 1080,
  overlay = null, onProgress = () => {}, signal
}) {
  if (videoUnsupported()) throw new Error('this browser has no WebCodecs video encoder');

  const aspect = poster.posterPx.w / poster.posterPx.h;
  const even = n => Math.max(2, Math.round(n / 2) * 2);          // h.264 needs even dimensions
  const vh = even(height);
  const vw = even(vh * aspect);
  const bitrate = Math.min(60e6, Math.round(vw * vh * fps * 0.22));  // grain is expensive to encode

  const codec = await pickCodec(vw, vh, fps, bitrate);
  if (!codec) throw new Error(`no h.264 encoder for ${vw}x${vh}`);

  // the muxer is only needed once someone actually exports a video
  const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');

  const duration = anim.duration / Math.max(0.05, speed);
  const frames = Math.max(2, Math.round(duration * fps));
  const seamless = !!anim.loop;      // loops omit the duplicate final frame

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width: vw, height: vh, frameRate: fps },
    fastStart: 'in-memory'
  });

  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encodeError = e; }
  });
  encoder.configure({ codec, width: vw, height: vh, bitrate, framerate: fps, latencyMode: 'quality' });

  // take over the renderer at video size
  const prevPR = poster.renderer.getPixelRatio();
  const prevW = poster.renderer.domElement.clientWidth || 300;
  const prevH = poster.renderer.domElement.clientHeight || 150;
  const prevBuffer = { ...poster.bufferPx };
  const base = player.snapshot(anim.tracks.map(t => t.path));

  poster.renderer.setPixelRatio(1);
  poster.renderer.setSize(vw, vh, false);
  poster.bufferPx = { w: vw, h: vh };

  // frames go through a 2d canvas only when something needs painting on top
  let scratch = null, sctx = null;
  if (overlay) {
    scratch = document.createElement('canvas');
    scratch.width = vw; scratch.height = vh;
    sctx = scratch.getContext('2d', { alpha: false });
  }

  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new Error('cancelled');
      if (encodeError) throw encodeError;

      const u = seamless ? i / frames : i / (frames - 1);
      player.applyAt(anim, base, u);
      poster.render();

      let source = poster.renderer.domElement;
      if (overlay) {
        sctx.drawImage(poster.renderer.domElement, 0, 0);
        overlay(sctx, vw, vh);
        source = scratch;
      }

      const frame = new VideoFrame(source, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps)
      });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      // let the encoder drain and the panel repaint
      if (encoder.encodeQueueSize > 8 || i % 5 === 0) {
        onProgress(i / frames);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    await encoder.flush();
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: 'video/mp4' });
  } finally {
    try { encoder.close(); } catch {}
    poster.renderer.setPixelRatio(prevPR);
    poster.renderer.setSize(prevW, prevH, true);
    poster.bufferPx = prevBuffer;
    for (const [path, v] of Object.entries(base)) player.apply(path, v);
    player.commit();
  }
}
