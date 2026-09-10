# Pilowlava 3D glyphs — modified copies

The `.obj` files in this folder are **modified copies** of Pilowlava 3D.

## Original work

- **Authors:** Vincent Wagner &lt;vincent@brot.studio&gt;, Anton Moglia &lt;anton@moglia.fr&gt;,
  Jérémy Landes &lt;jeremy@studiotriple.com&gt; (Copyright © 2020)
- **Published by:** Velvetyne Type Foundry
- **Originals available at:** https://gitlab.com/velvetyne/pilowlava3D
- **Announcement:** https://velvetyne.fr/news/pilowlava-3d/
- **Licence:** Free Art License 1.3 — full text in `LICENSE-pilowlava3d.txt`

## What was modified

The upstream release ships one OBJ containing the whole character set as separate objects.
For this tool that file was split and normalised, with no change to the geometry itself:

1. Each glyph (and each of its alternate cuts) was extracted into its own `.obj` file.
2. Vertices were re-indexed per file and translated so every glyph starts at x=0 with its
   baseline at y=0, and is centred on z=0 — layout metadata, not reshaping.
3. Texture coordinates were dropped; vertex normals were kept.
4. An `index.json` was generated listing each glyph's file, width, height and depth.

No vertex positions were otherwise altered: the forms are Wagner, Moglia and Landes' as
released. The meshes are subdivision cages and are smooth-shaded at load time by the
application, which is a rendering choice and does not modify these files.

## Licence of these modified copies

Per Free Art License 1.3 §2.3, these modified copies are distributed under the **Free Art
License 1.3**, the same licence as the original. Copying, distributing and further modifying
them is permitted under those terms.

The rest of this application is not part of this work; per FAL 1.3 §4, incorporating a
Free Art licensed work into a larger work does not place the larger work under this licence.
