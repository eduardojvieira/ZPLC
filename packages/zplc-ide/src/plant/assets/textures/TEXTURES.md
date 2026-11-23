# Plant textures (VIS-019, VIS-013)

The physically based materials of the 3D plant. Geometry is generated in code; these maps give it its surface. Each
folder is one material, and its `provenance.json` records the tool, the models, the exact prompt, the date, the
post-processing, the source and bundled sizes, and the licence.

| Folder          | Material                          | Base colour                  |
| --------------- | --------------------------------- | ---------------------------- |
| `painted-steel` | Powder-coated painted steel       | Grey, tinted by the renderer |
| `brushed-metal` | Brushed stainless steel           | Natural, metalness mask      |
| `rubber-belt`   | Black rubber conveyor belt        | Natural                      |
| `plastic`       | Moulded plastic, spark-eroded     | Grey, tinted by the renderer |
| `cardboard`     | Corrugated cardboard, outer liner | Natural                      |
| `floor`         | Epoxy-coated concrete floor       | Natural                      |

Every folder holds `basecolor.png`, `normal.png` (OpenGL convention, green up), `roughness.png` and `metalness.png`, all
512 x 512 except a uniform metalness map, which is 4 x 4. The maps tile seamlessly.

## Licence

Original content made for ZPLC (P17, SCN-003): each base colour was generated from a generic prompt that names no
product, brand or logo, and nothing is copied from another product. The textures are distributed under the MIT licence
of the repository (`LICENSE`). They are not third-party material, so THIRD-PARTY-NOTICES.txt does not list them.

## Making and checking them

- `bun tools/plant/textures.ts prepare <material> <source.png>` makes a seamless 512-pixel base colour from a generated
  image (converted from the generator's JPEG to PNG first; the record says how).
- `bun tools/plant/textures.ts derive` derives the normal, roughness and metalness maps of every material. It is
  deterministic and rewrites a map only when its pixels change.
- `bun tools/ci/plant-asset-guard.ts` (in CI through `bun test tools/ci`) checks every folder: the record and its
  fields, the real PNG format, at most 2048 pixels on a side, the seams, and that the derived maps derive again to the
  same pixels. It prints the bytes the textures add to an installer (VIS-013 budget: 50 MB for the whole plant).

The concept images that set the target look are in `specs/012-zplc-2-1-plant-simulation/concepts/` and are not bundled.
