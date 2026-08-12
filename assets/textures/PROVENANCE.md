# Texture provenance

The production version bundles a deliberately small set of 1K PBR textures so
the public experience remains self-contained and does not call an asset API at
runtime. All files below came from [Poly Haven](https://polyhaven.com/), whose
assets are released under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The downloads were obtained on 2026-08-12 through Poly Haven's public API and
verified against the API-provided MD5 checksums. Attribution is not required by
CC0, but the artists are credited here because provenance is part of the asset.

| Local set | Poly Haven asset | Artist(s) | Published physical width | Show use |
| --- | --- | --- | ---: | --- |
| `wooden_planks` | [Wooden Planks](https://polyhaven.com/a/wooden_planks) | Charlotte Baglioni (photography), Dario Barresi (processing) | 2 m | Hulls, docks, architecture, furniture, lockbox |
| `rusty_metal_04` | [Rusty Metal 04](https://polyhaven.com/a/rusty_metal_04) | Amal Kumar | 2 m | Seeker structures, worn fittings, lockbox ironwork |
| `rock_06` | [Rock 06](https://polyhaven.com/a/rock_06) | Rob Tuytel | 1.5 m | Chartless island, cliffs, erosion strata |
| `sand_01` | [Sand 01](https://polyhaven.com/a/sand_01) | Rob Tuytel | 1.5 m | Beaches, shifting sands, forest-floor micro relief |
| `brown_leather` | [Brown Leather](https://polyhaven.com/a/brown_leather) | Rob Tuytel | 0.4 m | Clothing, boots, straps, sail micro-normal detail |
| `plastered_wall_05` | [Plastered Wall 05](https://polyhaven.com/a/plastered_wall_05) | Charlotte Baglioni | 2 m | Caribbean facades and Seeker masonry |
| `stone_tiles_02` | [Stone Tiles 02](https://polyhaven.com/a/stone_tiles_02) | Charlotte Baglioni | 2 m | Foundations and chamber floors |

Each folder contains:

- a color map (`diff` or `albedo`) in sRGB;
- an OpenGL tangent-space normal map (`nor_gl`);
- an `arm` map whose red, green, and blue channels carry ambient occlusion,
  roughness, and metalness respectively.

`production-kit.js` derives repeats from the published physical dimensions,
adds low-frequency world-space variation to interrupt visible repetition, and
keeps the original files untouched. Colors in the show are material tints tied
to the represented object, not edits to these source files.

This notice covers only the listed texture files. It does not set or change the
license for the story, code, canonical archive, recordings, or other assets in
the repository.
