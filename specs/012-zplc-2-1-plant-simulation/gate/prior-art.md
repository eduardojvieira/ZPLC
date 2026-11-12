# Prior art: Open Industry Project (check 8)

- Repository: https://github.com/Open-Industry-Project/Open-Industry-Project
- Commit read: `5fad5d27c99fd6a297081d610b5c71009aedcdd9` (`main`, committed 2026-11-12T09:53:04-06:00)
- Date of reading: 2026-11-12
- Check 8 passes when every `reuse` row has a licence that permits it and its attribution line.

## What was read

`main` is the TypeScript / three.js / Jolt browser app (Electron shell in `apps/desktop/`), not the Godot version. The remote has three branches (`main` and two dependabot branches); none is a Godot branch. The archived Godot version is not on this repository's branches and was not looked at. Read only, shallow clone in a scratch directory: nothing was installed, built or run, and nothing was copied into ZPLC (P17). Meshes and images were not opened in a viewer, so a `reuse` verdict is a licence verdict; quality is still for the owner to judge under D-18 (B).

Licence sources at that commit:

- `LICENSE`: MIT, "Copyright (c) 2024-present, Automation Standard LLC and Contributors".
- `THIRD_PARTY_NOTICES.md`: says every GLB under `public/models/`, every texture under `public/textures/`, the parts under `public/part-assets/`, `assets/building-bake/`, `libraries/` and `examples/` are first-party work of Automation Standard LLC under that same MIT licence, and that no art asset comes from Godot or any asset store.
- No SPDX or copyright header was found in `examples/`, `libraries/`, or the GLB metadata (the GLBs carry only `"generator": "glTF-Transform v4.5.1"`). So those items have no notice of their own; the repository notice and `THIRD_PARTY_NOTICES.md` apply. Rows below write "MIT (repository)" only for those.
- Files with their own notice: `vendor/jolt-physics/LICENSE`, `public/fonts/LICENSE-plex.txt`, `packages/part-sdk/LICENSE` (not opened beyond its presence; treated as unclear).

Attribution line ZPLC would publish for every `reuse` row below (MIT requires the copyright and permission notice to travel with the copy):

> Contains material from Open Industry Project (https://github.com/Open-Industry-Project/Open-Industry-Project), Copyright (c) 2024-present, Automation Standard LLC and Contributors, MIT License.

## Table

| Item | Path at commit | What it is | Licence | ZPLC part | Verdict | Reason |
|---|---|---|---|---|---|---|
| Straight belt conveyor | `examples/parts/belt-conveyor/` (`behavior.ts`, `part.js`, `rig.json`), `src/core/conveyor/conveyorBeds.ts` | Part script on its own Part SDK; straight carry along +X | MIT (repository) | PRT conveyors | study | Written against OIP's Part SDK and bed model; ZPLC generates geometry in code and has its own part definition (P10). Read for behaviour and parameters only. |
| Belt path / flex belt | `src/core/conveyor/beltPath.ts`, `flexPath.ts`, `examples/parts/flex-conveyor/` | Inclined and multi-segment belt profiles | MIT (repository) | PRT conveyors | study | Not in the minimum catalogue (no inclined belt required). |
| Roller conveyor | `examples/parts/roller-conveyor/`, `examples/parts/_shared/rollerBed.js`, `src/core/conveyor/rollerGrid.ts` | Powered roller bed, deck is the surface, rollers decorative | MIT (repository) | PRT roller conveyor | study | Same surface-velocity approach as the belt; decorative rollers match ZPLC's parametric geometry. |
| Curved conveyor | `examples/parts/curved-conveyor/`, `examples/parts/curved-roller/`, `src/core/conveyor/conveyorSurface.ts` | Quarter-turn belt; arc surface velocity, rigid rotation `omega = speed / centreline radius` | MIT (repository) | PRT curved conveyor | study | The arc formula is worth knowing; ZPLC writes its own, a few lines. |
| Spur conveyors | `examples/parts/spur-conveyor/`, `spur-roller-conveyor/` | Angled side conveyors | MIT (repository) | none in the minimum catalogue | no | No reference scene needs them. |
| Chain transfer | `examples/parts/chain-transfer/` | Right-angle transfer: chains rise, bed diverts cargo 90 degrees | MIT (repository) | PRT chain transfer | study | Same family as ZPLC's chain transfer; OIP's logic is tied to its rig format. |
| Turntable conveyor | `examples/parts/turntable-conveyor/` | Kinematic disc on a revolute joint; arc surface velocity while slewing | MIT (repository) | PRT turntable | study | Shows how a slewing deck carries cargo; ZPLC would re-derive it. |
| Diverter | `examples/parts/diverter/`, `public/textures/DiverterLabel.webp` | Diverter arm with a warning label | MIT (repository) | PRT diverter arm | study | Behaviour tied to OIP's rig; the label is lettering drawn by a script in that repository. |
| Pusher / aligner / chute / lift | none found in `examples/parts/` | Not present | n/a | PRT pusher, aligner, chute, lift | no | OIP has no part of these kinds at this commit. Blade stop (`examples/parts/blade-stop/`) is the nearest and is a pop-up stop, not a pusher. |
| Blade stop | `examples/parts/blade-stop/` | Pop-up blade on a prismatic joint | MIT (repository) | PRT stop blade | study | Same reason as the belt. |
| Photo-eye (diffuse / retro) | `examples/parts/diffuse-sensor/`, `src/core/beamCast.ts` | Beam cast against cargo each tick; presence tag, emissive LED | MIT (repository) | PRT diffuse, retro-reflective | study | The host casts a beam and hands the part the hit; ZPLC's sensors are defined differently (PRT-006). |
| Laser distance sensor | `examples/parts/laser-sensor/` | Reports metres to nearest cargo, or max range | MIT (repository) | PRT light array (partly) | study | Distance, not a height array. |
| Light curtain | `examples/parts/light-curtain/` | Four-beam fail-safe OSSD | MIT (repository) | PRT light array (for height) | study | ZPLC needs a height output, not an OSSD. |
| Colour sensor | `examples/parts/color-sensor/` | Matches cargo tint to a colour list, publishes an INT code | MIT (repository) | PRT vision sensor (identity code) | study | Close to PRT-005's "identity as a code"; ZPLC reports an identity, not a colour. |
| Barcode scanner | `examples/parts/barcode-scanner/` | Arch that reads the label on each case | MIT (repository) | PRT vision sensor | study | Same note. |
| Inductive, capacitive, scale, limit switch | none found | Not present (searched `examples/`, `libraries/`, `src/` for inductive, capacitive, proximity) | n/a | PRT sensors | no | Nothing to learn from or reuse. |
| Box | `examples/parts/box/`, `src/render/parts/cargoBox.ts`, `cargoBoxMesh.ts` | Cardboard case as a dynamic cargo body | MIT (repository) | PRT items | study | Parametric in OIP too. ZPLC's boxes are three heights and two masses; read for body settings. |
| Pallet | `examples/parts/pallet/`, `src/render/parts/pallet.ts`, `palletMesh.ts`, `src/sim/bodyFactory.ts` | Four-way block pallet as one dynamic body | MIT (repository) | PRT pallet | study | Useful: `bodyFactory.ts` raises the pallet's solver iterations (`PALLET_VELOCITY_STEPS = 60`, `PALLET_POSITION_STEPS = 10`) because a load sinks into the deck otherwise. Relevant to check 1 tuning. |
| Unit load, tote, drum, IBC tote | `examples/parts/unit-load/`, `libraries/containers/{tote,drum,ibc-tote}/` | Pallet plus cases as one product; container parts | MIT (repository); `docs/part-libraries.md` says listed library parts are also offered under CC BY 4.0 for models and textures | PRT items (crate) | study | Crate-like items; the CC BY 4.0 offer applies only when published through their part library, so the in-repo MIT notice is the one recorded. |
| Emitter and remover | `examples/parts/box-spawner/`, `despawner/`, `palletSpawner/` | Timed spawn of any cargo part; despawn zone with count and rate | MIT (repository) | PRT emitter, remover | study | Seeded and deterministic in OIP too; ZPLC defines its own signals. |
| Grippers and pick and place | `examples/parts/six-axis-robot/`, `examples/parts/gantry/`, `src/sim/bodyHolds.ts` | Six-axis arm with vacuum jobs; gantry; held bodies go kinematic and follow the gripper pose | MIT (repository) | PRT two-axis pick and place, gantry, vacuum gripper | study | `bodyHolds.ts` shows the grab technique (take a body kinematic, set its pose each step, return it to dynamic). No two-axis pick-and-place or clamp exists. |
| Stations | `examples/parts/pallet-dispenser/`, `stretch-wrapper/`, `rack/` | Pallet dispenser, stretch wrapper, rack | MIT (repository) | PRT stacker crane, palletizer | no | Not the stations ZPLC lists (stacker crane with rack, layer palletizer, machining centre). |
| Tanks and process parts | none found; `libraries/containers/ibc-tote/` is a cargo container whose description calls it a tank | No fill, valve, level or flow part | n/a | PRT process | no | OIP has no process family. The IBC tote is a stackable item, not a vessel with signals. |
| Operator panel | `examples/parts/push-button/`, `stack-light/`, `safety-gate/` | Push button (momentary or latched), 1 to 8 segment stack light, safety gate | MIT (repository) | PRT operator panel | study | No selector, e-stop, potentiometer or display found. Behaviour is tied to OIP's SDK. |
| Meshes | `public/models/Gantry.glb`, `SixAxisRobot.glb`, `AGV.glb`; `public/models/building/`, `dockDoor/`; `public/part-assets/*.glb`; `assets/building-bake/*.glb` | Authored GLBs, one has ~15k vertices | MIT (repository); `THIRD_PARTY_NOTICES.md` states first-party, no asset-store material | VIS, PRT | study | Licence allows reuse with attribution. Quality and size not reviewed, and the six-axis, AGV and building meshes serve parts or scenes outside the minimum catalogue. ZPLC's default is geometry generated in code (PRT-009). Decide after a viewing. |
| Textures: box and pallet | `public/textures/BoxCardboard.webp`, `BoxCardboardNormal.webp`, `BoxCardboardRoughness.webp`, `PalletWood.webp`, `PalletWoodNormal.webp`, `PalletWoodRoughness.webp`; generators `scripts/build-box-textures.mjs`, `scripts/build-pallet-textures.mjs` | Textures generated from seeded noise and shapes drawn in the scripts; the label is fictional | MIT (repository); `THIRD_PARTY_NOTICES.md` names them first-party, generated, no third-party source | VIS / PRT items | reuse | Licence permits copying, modification and redistribution with the notice; no third-party material inside. Attribution line: see above. Quality to be viewed before use (D-18 B); the images are tied to OIP's box and pallet UVs. |
| Textures: belt, metal, chain, tread plate, floor | `public/textures/BeltFabric.jpg`, `BeltFabricArrows.jpg`, `Metal.webp`, `RollerMetal.webp`, `DiverterMetal.webp`, `ChainLink.webp`, `TreadPlate*.webp`, `BuildingFloor.webp`, `DeckSolidNormal.webp` | Textures; the tread plate, deck and floor ones are script-generated; `BeltFabric.jpg` is named in `THIRD_PARTY_NOTICES.md` as first-party but no generator is named for it | MIT (repository) | VIS | study | Origin of the belt, metal and chain images is stated only as "first-party"; no generator or source file is recorded for them, so provenance is less clear than for the generated ones. |
| Fonts | `public/fonts/plex-sans-*.woff2`, `plex-mono-*.woff2`, `public/fonts/LICENSE-plex.txt` | IBM Plex Sans and Mono | SIL OFL 1.1 ("Copyright 2017 IBM Corp. with Reserved Font Name Plex"), its own notice | none (ZPLC has its own UI fonts) | no | Not needed. |
| Thumbnails, landing images, logos, icons | `public/thumbnails/`, `public/landing/`, `public/icons/`, `public/oip-logo.svg`, `.github/OIP-LOGO-*.svg` | OIP's catalogue thumbnails and branding | MIT (repository), but they are OIP's marks | none | no | Branding and screenshots of another product; never a ZPLC asset. |
| Jolt Physics fork | `vendor/jolt-physics/` (`LICENSE`, `README.md`) | `jolt-physics` 1.1.0-oip.9: upstream 1.1.0 plus four patches (native `ConveyorContactListener`, `BodySnapshot`, SIMD, coupled planar friction) | MIT, "Copyright (c) 2022-2024 Jorrit Rouwe" (its own notice) | PLT | no | ZPLC pins the npm package (D-14). Rebuilding a forked WASM is a dependency and build change outside the gate. Study the patches' idea only. |
| Belt technique | `src/sim/conveyorContacts.ts` (listener, lines about 44-215), `src/sim/conveyorFacets.ts`, `src/core/conveyor/conveyorFriction.ts`, `src/core/types/base.ts` (`CONVEYOR_FRICTION = 0.35`, `BELT_FRICTION = 0.7`, `BOX_FRICTION = 0.5`), `src/sim/world.ts` (`wakeCargoOn`, `CARGO_WAKE_MARGIN = 0.05`) | See next section | MIT (repository) | PLT belt | study | Confirms Task 2's approach; ideas, not code. |
| Part SDK | `packages/part-sdk/` | OIP's public SDK for custom parts | its own `LICENSE` (not read) | none | no | ZPLC defines parts once in its own catalogue (PRT-002). |
| Source of the core and sim | `src/core/`, `src/sim/`, `src/render/` | OIP's TypeScript engine | MIT (repository) | PLT, VIS | no | Coupled to OIP's scene, rig and part formats; ZPLC writes its own (D-18 A and B). D-18 C (depend on it) is excluded because its README says breaking changes can land in any update. |
| Controller drivers | `src/plc/`, `apps/desktop/*Io.cjs` | S7, ADS, EtherNet/IP, OPC UA drivers | MIT (repository); `src/plc/link/s7Client.ts` is a port of oip-comms (MIT, same copyright) | LNK | no | ZPLC's link is Modbus/native; out of scope for prior art here. |

## Belt technique compared with Task 2

What OIP does (read in `src/sim/conveyorContacts.ts`, `conveyorFriction.ts`, `world.ts`):

- A conveyor bed is a static or kinematic body. Surface velocity is written into the contact settings (`mRelativeLinearSurfaceVelocity`, and `mRelativeAngularSurfaceVelocity` for curved decks) from `OnContactAdded` and `OnContactPersisted`. Same mechanism as Task 2's `Examples/conveyor_belt.html` approach.
- The listener is `J.ContactListenerJS` in JavaScript (lines about 208-211), fed by a facet table (`FACET_STRIDE = 16` float64s per conveyor entry, `FACET_CAPACITY = 4096`) that a native `ConveyorContactListener` in OIP's forked Jolt also reads. The JS listener's comments say it mirrors the native one. So the fork adds a native path for speed; Task 2 uses the JS listener only.
- It also sets `mFrictionCoupling = 1` on conveyed contacts (a field from OIP's Jolt patch, not in upstream) and overrides `mCombinedFriction`. Task 2 has no such field and uses friction 0.6 on both belt and box, so Jolt's `sqrt(a*b)` gives 0.6.
- A running-surface gate (`onRunningSurface`) only conveys contacts on the declared surface normal, so a box hitting a belt flank is not dragged.
- Surface friction is stored so that the belt-versus-standard-carton pair equals the datasheet value: `mu^2 / BOX_FRICTION`.
- Starting a stopped belt wakes the cargo on it: `wakeCargoOn` in `world.ts`, edge-triggered, with `CARGO_WAKE_MARGIN = 0.05` m. Task 2 does the same ("a change of target wakes the bodies resting on the belt", test 4).
- Pallets get 60 velocity and 10 position solver iterations per body because a load sinks into the deck at the defaults. Task 2's allowed tuning ("Jolt's solver iteration counts") covers this.
- Fixed step `1/hz` with the PLC scan interleaved and fed the step's dt, never wall clock (`docs/sim-clock.md`). Same principle as the plan's lock-step (Task 5).

Differences from Task 2: OIP has no speed ramp that I found (Task 2 ramps by `accelMps2 x stepSeconds`; I did not search every bed kind); OIP has curved and slewing beds, Task 2 only a straight belt; OIP has a native listener and friction coupling that Task 2 does not use. Nothing here contradicts Task 2. The two things to watch if check 1 is marginal are the pallet solver iterations and friction coupling (a Jolt patch, so unavailable in the pinned npm package).

## Counts

- Rows: 33. Verdicts: `reuse` 1, `study` 22, `no` 11 (rows with "n/a" licence are `no`).
- The one `reuse` row is the box and pallet textures.

## Verdict for check 8

Pass. The only `reuse` row (box and pallet textures) is covered by the MIT licence of the repository and by `THIRD_PARTY_NOTICES.md`, which names those textures as first-party and script-generated, and it carries the attribution line above. No row has an unclear licence marked `reuse`. Open Industry Project has no per-asset licence that differs from the repository's, except the IBM Plex fonts (OFL-1.1) and the Jolt fork (MIT, Jorrit Rouwe), both marked `no`.
