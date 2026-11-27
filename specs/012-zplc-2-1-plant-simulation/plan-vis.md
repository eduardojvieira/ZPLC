# Plan: photorealistic plant view (D-27, VIS-014 to VIS-019)

**Goal:** the 3D plant view looks like an industrial plant and draws what matters for control, as the owner decided on 2026-11-23
(spec section 4.1 S-12, section 4.2 D-27).
**Spec:** `spec.md` VIS-002, VIS-003, VIS-004, VIS-005, VIS-009, VIS-011 to VIS-019, PRT-009.
**Owner's stops:** (2) the pilot with captures in three sizes, three modes and three quality levels and their frame rates; (3) the
catalogue sheet; (4) the 21 scenes, the evidence and the bench. Nothing after a stop starts without the owner's approval.
**Constraint:** only the view changes. The plant core, the snapshot, the scenarios, `sceneHashes.json` and `hashes.json` do not.

## State after the pilot (2026-11-23)

| Branch | What it holds |
|---|---|
| `fix/plant-view-framing` | F2: the first view fits the whole scene at any panel size; the "Fit scene" command. F4: a pallet or a fixed crate drawn once. A real-window journey over the 21 scenes at 480×640, 720×800, 1280×720 and 1920×1080. |
| `feat/plant-textures` | Six seamless materials (painted steel, brushed metal, rubber belt, plastic, cardboard, floor) with base colour, normal, roughness and metalness maps; the derivation script; the provenance guard (VIS-019). |
| `docs/plant-photoreal` | The spec amendment and this plan. |
| `feat/plant-pilot` | Composed models for the belt, the diffuse sensor, the push button and the emitter; environment map, soft shadows, filmic tone mapping and sRGB output; low without textures or environment; high contrast flat with outlines; F1 for those parts; F3 for every scene; part and signal names on hover and focus; real-window checks; the capture script; frame rates on the reference laptop. |

Measured cost of the pilot: one writer session of about 1.5 hours (+2,801/−359 lines over 33 files), after the framing fix and the
textures.

## Tasks and estimate

A unit is one bounded writer session of about 1 to 1.5 hours, with its own tests. Catalogue tasks C1 to C7 each own one family file,
so up to three run in parallel (one writer per file).

| ID | Task | Requirements | Units |
|---|---|---|---|
| P1 | Revise the pilot's look after the owner's review of the pilot captures and the concept images. | VIS-014, VIS-015 | 1 |
| C0 | Split `view/models.ts` into one file per family, with shared helpers (bevel, extrusion profile, material roles). | VIS-014 | 0.5 |
| C1 | Conveyors: roller conveyor, curved conveyor, chain transfer, turntable, lift. | VIS-014, VIS-016 | 1 |
| C2 | Flow control and sinks: stop blade, pusher, diverter arm, aligner, chute, remover. | VIS-014, VIS-016 | 1 |
| C3 | Sensors: retro-reflective, inductive, capacitive, light array, scale, vision sensor, limit switch. | VIS-014, VIS-016 | 1 |
| C4 | Operator panel: selector switch, emergency stop (red on yellow), indicator light, stack light on a pole, potentiometer, numeric display with digits. | VIS-014, VIS-016 | 1 |
| C5 | Manipulators: two-axis pick and place, three-axis gantry with columns, vacuum gripper, clamp. | VIS-014, VIS-016 | 1.5 |
| C6 | Stations: stacker crane with rack, layer palletizer, machining centre. | VIS-014, VIS-016 | 1.5 |
| C7 | Process and items: tank with pipes, on/off and proportional valves, level meter, flow meter; the box heights, pallet, crate, lid, base, coloured part, and metal items drawn as metal. | VIS-014, VIS-016, VIS-018 | 1 |
| C8 | The catalogue sheet: every part in every state, in three modes and three levels. **Owner's stop 3.** | VIS-014 | 0.5 |
| — | Corrections the owner asks for on the sheet (one or two rounds expected). | VIS-014 | 1 to 3 |
| E1 | Real-window evidence for the 21 scenes: one state pair per stateful part kind, the colour check over every colour word of the lessons and scenes; framing and single draw already exist. Commands (packages/zplc-ide, non-zero exit on a finding): `bun scripts/plant/capture.ts --check states` and `bun scripts/plant/capture.ts --check colours`. | VIS-016, VIS-017, VIS-018 | 1 |
| E2 | The packaged application: textures load from `file://` under the production content security policy; the bench `frames` sequence per level on the largest scene with the GPU window and the frame cap off; installer growth measured on the package. | VIS-004, VIS-005, VIS-012, VIS-013, VIS-015 | 1 |
| E3 | Documentation in English and Spanish: the plant pages and every plant screenshot captured again; the capture script regenerates the 21 scenes. **Owner's stop 4.** | VIS-011 | 1 |
| V | One independent verifier at the end of the feature. | VIS-014 to VIS-019 | 1 |

Total: about 15 to 17 units. With three writers in parallel on C1 to C7, about two working days, plus the owner's review at stops 3
and 4.

## 2.1.0 and 2.1.x

Recommendation: everything in the table goes in 2.1.0. F1, F3 and the framing are defects against requirements 2.1 already claims
(VIS-002, VIS-003), and a scene that mixes composed parts with single boxes looks unfinished.

In 2.1.x, what goes beyond a recognisable, physically based part:
- the plant in a window of its own (VIS-001, moved on 2026-11-23);
- ambient occlusion or other post-processing at the high level;
- per-roller animation, wear and more material variety;
- frame-rate evidence on macOS and Windows, which needs those machines with a GPU.

A smaller 2.1.0 is possible: composed models only for the parts of the first course modules, the rest drawn as today under the new
lighting. It is not recommended, because the scenes would mix two looks.

## Risks

- **Look.** The pilot meets the measures of VIS-015, VIS-016 and VIS-018, but it reads more as a clean CAD render than as a
  photograph. That gap is art direction, not code: P1 settles it with the owner before C1 to C7 repeat it 42 times.
- **Size.** 5.9 MB of textures now; the catalogue may add two to four materials of about 1 MB each at 512 px, so under 12 MB of the
  50 MB budget (VIS-013).
- **Frame rate.** The pilot measured 60 frames per second at every level, but at the display's 60 Hz cap, under load, in the
  development build. The headroom on integrated graphics is unknown until E2 measures the largest scene with the cap off.
- **Evidence level.** The real-window checks run with software GL: they prove what is drawn, not timing.
