# prmpt.bio brand studio

<img width="1200" height="630" alt="The prmpt.bio key mark extruded in 3D — glossy blue with black keyline relief and a real hole through the bow — above the wordmark in black metal, on a grained scarlet ground crossed by the studio's composition grid" src="https://github.com/user-attachments/assets/b3830cb1-f5f9-4035-86d8-a6d71c245927" />

A local Three.js tool for building posters in the prmpt.bio identity: a real 3D
extrusion of the key mark, the wordmark in Pilowlava 3D with a black-metal finish,
brand-colour grounds with grain, and PNG-24 export.

## Run it

Serve the folder over HTTP and open it:

```
python3 .claude/dev-server.py
```

then visit `http://localhost:8123`. A server is required: ES modules and `fetch`
don't work from `file://`.

Any static server will do, but that one sends `Cache-Control: no-store`. Plain
`python3 -m http.server` sends only `Last-Modified`, so browsers fall back to heuristic
freshness — roughly 10% of the file's age — and will serve an edited file straight from
cache without asking. Nothing here is content-hashed, so there is no cache to bust.

Runs entirely offline: Three.js, the fonts and the meshes are all vendored here.

## Controls

| | |
|---|---|
| select | click an object |
| move | drag (snaps to the grid) · arrow keys nudge · shift+arrows = 1 unit |
| resize | drag any corner handle (anchored on the opposite corner), or the size slider |
| deselect | esc or click the background |

The poster is 100 units tall in the coordinate space the panel and grid use, whatever
the pixel size — so a layout survives a change of canvas format.

The grid and the centre snap guides are drawn on a separate overlay that blends by difference,
so every line inverts whatever it happens to cross — cyan over the scarlet ground, black over
white, shifting again as it passes over the key. (A mid-grey custom ground is the one case where
inversion lands close to the original value and the lines go faint.) The selection box, its corner
handles and the label stay on a normal overlay so they keep their own colour. Neither overlay is
part of the WebGL canvas, so nothing here reaches the export.

- **canvas** — presets from square to A3/300dpi, or custom pixels. Grid step and snapping.
  `include grid in exports` paints the grid into the PNG and the MP4 as well, using the same
  difference blend as the on-screen guides, scaled to the export resolution.
  `exports match preview look` (on by default) is explained under **WYSIWYG** below.
- **background** — the four brand colours plus a custom picker; `noise` and `grain size`
  affect *only* the background. Grain is defined in poster pixels, so the preview shows
  the export's grain, not the screen's.
- **logotype** — `colour` gives the four brand swatches plus a custom picker (it drives a metal
  material, so bright colours read as tinted chrome). Any text, not just the wordmark: all 61 characters
  (a–z, 0–9, punctuation) are included, as 92 meshes once Pilowlava's alternate cuts
  are counted. Enter in the text box starts a new line, and lines are centred on
  each other; `leading` is the baseline-to-baseline distance in cap heights, so `1.00` sets the
  lines flush and anything below that overlaps them on purpose. The block is centred on its ink,
  so adding a line grows it around the position you placed rather than pushing it down.
  `shuffle alternates` cycles Pilowlava's alternate cuts —
  nineteen characters have more than one, and a, s and v have four apiece. Gloss drives roughness + clearcoat.
- **key** — `edge bevel` rounds the extruded edges; it is capped in absolute units because a
  bevel scaled off `depth` self-intersects on this outline's tight concave curves. A genuine
  extrusion of `assets/key.svg`: each painted layer of the original
  becomes its own extruded solid, stacked by `layer gap`, so the artwork's black keylines
  and offset shadow become real relief. `body colour` overrides the blue for tone-on-tone
  grounds, and `keyline colour` recolours the black layers — the outline and the offset shadow —
  independently of it. Both offer brand swatches plus a custom picker, same as the ground and the
  logotype. The bow's
  eye is a true hole cut through every layer, so it stays a hole at any
  rotation. (`eye disc matches background` only appears if you load a mark that still paints
  the eye as a filled disc.)
- **light** — key light, rim light, environment reflections, and the angle both lights swing on.
- **animate** — pick an animation, press play; `export mp4` writes it to a file. Speed scales the duration; the loop box follows
  each animation's own default when you switch (looping ones tick it on). Stopping restores the
  composition you had before you pressed play, so animating is never destructive. Animations run
  in draft mode — the tracer restarts accumulating on every change, so it can't animate; selecting
  play while ray-traced drops you back to draft.
- **render** — `draft` is the real-time raster preview. `ray traced` switches to a progressive
  GPU path tracer: real shadows between the key's stacked layers, self-reflections between the
  letters, and bounce light, accumulating toward the `samples` target. `trace scale` renders at a
  fraction of the canvas for a faster (softer) preview. `speckle filter` trades reflection
  sharpness against specular fireflies — see below. Compose in draft, finish in ray traced.
  While the tracer's shader compiles, the raster preview stays on screen, so it never goes blank.

## Export

`export png-24` renders at the full canvas pixel size (independent of the preview) and
writes a genuine 24-bit PNG — colour type 2, 8 bits per channel, **no alpha channel**,
encoded in-page rather than via `toDataURL` (which always emits 32-bit RGBA).

Flat background areas come out as the exact brand hex: the background pass bypasses
colour management and tone mapping, so `#f8280c` exports as `#f8280c`.

## The key asset

`assets/key.svg` is the mark with a **real hole**. In the original artwork the bow's eye was a
red disc painted on top — it only read as a hole because the background happened to be the same
red. The disc sat over three stacked layers (the black outline, the blue body, and the black bow
ring), so the fix was to append the disc's outline as a second subpath on each of those three and
switch them to `fill-rule="evenodd"`. The eye is now transparent through the whole stack, on any
background and at any angle in 3D.

It has had the C2PA provenance metadata and `preserveAspectRatio="none"` stripped.

## WYSIWYG: why exports used to look smoother

The preview canvas is a fraction of the poster's pixel size — around 508×635 against a
1600×2000 poster. Two things therefore read *coarser* on screen than in a file:

- grain clamps to a minimum of one device pixel, so a preview cell covers about 1.6‰ of the
  image height where an unclamped export cell covers 0.7‰;
- the traced layer at `trace scale` 0.5 is 254px wide on screen but 800px wide in a
  poster-sized export — same fraction, three times finer in absolute terms, so the blocks
  disappear once the file is viewed at a sane size.

`exports match preview look` (default on) removes both gaps: grain is emitted at the same
*relative* cell size the preview showed, and the traced layer keeps the same *absolute*
resolution it had on screen. A chunky low-res preview then exports chunky, which is the
point of dialling `trace scale` down for effect rather than for speed.

Turn it off when you want maximum fidelity — finer grain and a traced layer sized against the
poster instead of the window. Note that with it on, the export depends on the preview size, so
resizing the window changes how coarse the result is.

## Highlights and speckle

Two separate things make white specks appear on near-mirror metal, and they need different fixes.

*Fireflies* are single high-energy samples that survive averaging, so they persist however long
you accumulate. `speckle filter` drives the tracer's `filterGlossyFactor`, which roughens glossy
lobes **after** the first bounce: primary reflections stay sharp, the paths that produce specks
get damped. 0.5 is a good default; raise it if specks persist, drop it toward 0 for maximum
reflection detail. Bounces are capped at 6 for the same reason.

*Blown highlights* are not noise at all — a reflection brighter than 1.0 clips to flat white with
a hard edge, at any sample count. The renderer uses Khronos PBR Neutral tone mapping, which rolls
those off smoothly and holds saturated colour far better than ACES. The background is a raw shader
pass that never calls `toneMapping()`, so the brand hex still exports exactly (verified: `#f8280c`
and `#251ef2` come back byte-exact). The studio softboxes are also kept below the old peak so
mirror highlights land nearer the rolloff knee.

## About the ray-traced mode

Only the objects are traced; the brand ground stays a flat raster pass underneath. That keeps the
background's exact hex and its background-only grain, and it means the tracer's escaped rays are
told to contribute nothing (a black background map plus zero background alpha), so the accumulated
buffer is clean premultiplied coverage that composites cleanly over the ground.

Both modes share one procedural studio environment — soft boxes rather than a furnished room —
so the draft preview and the traced result are lit the same way. The tracer needs it as a raw
equirect; the raster path uses a PMREM of the same map.

Export in ray-traced mode accumulates the full sample count and then encodes. The canvas renders
at **full poster pixels**, so the ground and its grain stay crisp; `trace scale` decides how large
the traced layer itself is, because the tracer's float render targets are what actually run out of
memory. At 0.5 the objects are traced at half resolution and composited up, which is often
indistinguishable on soft glossy shading and roughly four times faster.

The scale is clamped only if the traced buffer would exceed 2400px on the long edge — an A3 poster
traces at 0.484 whatever you ask for — and the export note tells you when that happened.

## Share links

`copy share link` packs the whole composition into the URL hash and copies the link. Opening it
restores everything: canvas size, ground and grain, both objects' text, transforms, materials and
colours, the lights, the grid, the render settings — draft or ray traced, samples, speckle filter
and trace scale — and the selected animation. The panel controls are re-synced too,
so the sliders agree with what you see. A link saved in ray-traced mode reopens in it and loads
the tracer on arrival.

Payloads are versioned (`v: 1`); a link from a future schema is refused with a message rather than
half-applied. New fields are added additively rather than by bumping the version, so a link copied
before the render settings existed still opens — the absent block falls back to the defaults.
Editing the hash by hand or pasting a new one re-applies it live — the app listens
for `hashchange`. A typical link is around 500 characters.

Render mode can also be deep-linked with query parameters, which is handy for opening a
heavy trace directly: `?rt=1` starts in ray-traced mode, `?samples=` (8–512) and `?scale=`
(0.25–1) set the target and the trace scale. They are routed through the same state as the
panel, so a share link copied afterwards carries whatever the query asked for.

## Exporting video

`export mp4` renders the selected animation **frame by frame** rather than screen-capturing it:
the timeline is sampled at exact frame times, so nothing drops, the duration is exact whatever
the machine is doing, and it can encode larger than the on-screen canvas. Encoding is WebCodecs
H.264 muxed with `mp4-muxer`; the codec profile is chosen by asking the browser what it supports
(High, then Main, then Baseline). Dimensions come from the canvas aspect at the chosen height,
rounded to even numbers because H.264 requires it.

Looping animations drop the duplicate final frame so the file loops seamlessly; one-shots keep
their final frame. The speed slider changes the exported duration too. Bitrate is deliberately
generous — film grain is expensive to encode and starves at ordinary rates.

The composition is snapshotted before the export and restored after, same as playback.

## The animations

Six presets in `src/animate.js`, each a set of tracks over normalised time:

| | |
|---|---|
| **drop in** | key falls in on `outBounce` with an `outElastic` tilt, wordmark pops after it on `outBack`, key light swings round |
| **turntable** | continuous `linear` yaw with an `inOutSine` bob and counter-rotating wordmark — loops seamlessly |
| **unlock** | key turns −92° like a key in a lock, snaps back elastic, ground flashes blue on the click, wordmark rises on `outExpo` |
| **breathe** | slow `inOutSine` on scale, gloss and noise — loops |
| **riso flicker** | hard `step` cuts through all four brand grounds with jittered rotation and grain — loops |
| **fly by** | both objects sweep in from opposite sides while spinning — key on `outQuint`, wordmark on `outExpo` — light rakes across |

Track values are absolute by default, but `rel` adds to and `mul` scales the value the parameter
had when you pressed play — so every animation plays around *your* layout rather than snapping to
hardcoded coordinates. Tracks deliberately drive only cheap parameters (transforms, colours,
gloss, grain, lights). Depth, layer gap, bevel and text rebuild geometry, which is far too slow
for a per-frame track.

Easings available to tracks: `linear`, `inOutSine`, `inOutCubic`, `outQuint`, `outExpo`, `inExpo`,
`outBack`, `inOutBack`, `outElastic`, `outBounce`, `step`.

## Rendering notes

Three things in the extrusion had to be handled or the key shows artifacts under rotation:

- Every layer that the hole is cut through carries the *same* bore outline, and the plates
  interpenetrate, so those bore walls would be exactly coincident and z-fight into rings.
  Layers further back get a fractionally wider bore, nesting them instead — only the front
  bore is ever visible and the difference is far too small to read as a step.
- Extruded side walls get one flat normal per curve segment, which reads as hard specular
  banding on glossy metal. `toCreasedNormals` at 35° smooths the shallow seams while leaving
  the real front-face edges sharp — cheaper and better looking than subdividing further.
- The studio environment uses broad soft boxes. Sharp ones reflect off the walls as hard
  streaks that look like a renderer bug rather than light.

## Notes

- Lit surfaces are colour-managed and tone-mapping is off, so the key's blue reads true.
- On a blue ground the blue key goes tone-on-tone — switch `body colour` to red or paper,
  which matches the brand rule that big blue-on-dark type is the zone to avoid anyway.
- The sculpted glyphs are subdivision *cages*; they're welded and smooth-shaded on load,
  which is why they read as molten rather than faceted. Silhouettes stay polygonal at
  extreme sizes — that's the source geometry, not the renderer.
- The camera is orthographic on purpose: no perspective distortion in a poster. Depth
  comes from the objects' own rotation and the lighting.
- `window.__studio` exposes the poster, state and modules on the page for poking at things
  from the console. It is a deliberate debug handle, not a leftover.

## Credits and licences

### Pilowlava 3D (the sculpted glyph meshes, `assets/glyphs/*.obj`)

Copyright © 2020 **Vincent Wagner**, **Anton Moglia** and **Jérémy Landes**, published by
Velvetyne Type Foundry. Licensed under the **Free Art License 1.3**.

- Originals: https://gitlab.com/velvetyne/pilowlava3D
- Release notes: https://velvetyne.fr/news/pilowlava-3d/
- Licence text: `assets/glyphs/LICENSE-pilowlava3d.txt`

The files shipped here are **modified copies** — the upstream single-OBJ character set was
split into one file per glyph and normalised for layout. What changed, and the terms these
modified copies are distributed under (FAL 1.3, same as the original), are set out in
`assets/glyphs/NOTICE.md`.

### Pilowlava (the 2D font, `assets/Pilowlava-Regular.woff2`)

Copyright © Anton Moglia and Jérémy Landes. **SIL Open Font License 1.1**, reserved font name
"Pilowlava". Shipped unmodified — this is the upstream webfont build, not a re-generated one,
so the reserved name is not in question. Source: https://velvetyne.fr/fonts/pilowlava/ ·
Licence text: `assets/LICENSE-pilowlava-font.txt`.

### Libraries (all MIT, all vendored unmodified)

| | |
|---|---|
| three.js | `vendor/LICENSE-three.txt` |
| three-gpu-pathtracer | `vendor/LICENSE-three-gpu-pathtracer.txt` |
| three-mesh-bvh | `vendor/LICENSE-three-mesh-bvh.txt` |
| mp4-muxer | `vendor/LICENSE-mp4-muxer.txt` |

### The key mark

`assets/key.svg` is your own artwork, generated with Recraft and then edited (C2PA provenance
metadata stripped, the bow's eye converted to a real hole). Not covered by any of the above.

### Your own code

The application code — `src/`, `index.html`, `style.css` and `.claude/dev-server.py` — is
**MIT licensed**: the text is in `LICENSE`, and `NOTICE` sets out exactly which files that
covers and which it does not. FAL 1.3 §4 is explicit that incorporating a Free Art licensed
work into a larger work does not place the larger work under that licence — only the glyph
meshes carry it.

**If a poster or video made with this tool goes public, credit Vincent Wagner, Anton Moglia
and Jérémy Landes for the 3D lettering.**

## Publishing this tool

It is fully static — no build step, no server code, no external requests. Upload the folder
and it runs. Two notes:

- **Serve it over HTTPS.** The share button (`navigator.clipboard`) and MP4 export
  (`VideoEncoder`) are secure-context APIs and quietly degrade or fail on plain HTTP.
- **Enable gzip/brotli** — the vendored libraries are ~1.83 MB raw but ~390 KB compressed,
  and the glyph OBJs compress to about a third of their size.
