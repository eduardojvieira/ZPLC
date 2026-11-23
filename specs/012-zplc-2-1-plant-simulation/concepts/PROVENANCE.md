# Concept images: provenance

Concept images for the art direction of the photorealistic plant view (spec section 4.2 D-27, VIS-014, VIS-015). They are
references for the owner's review and for the writers of the catalogue. They are not product assets: nothing in this folder
is packaged, loaded by Studio or listed in `IDE/src/plant/view`.

Rules they follow (owner's brief of 2026-11-23): generic prompts with no product names, brands or logos (P17, SCN-003), and
no repository or personal data.

## concept-station.jpg

| Field | Value |
|---|---|
| Tool | Antigravity CLI (`agy`) 1.5.15, run in an empty directory outside the repository: `agy -p "<request>" --model gemini-4-neon-high --mode accept-edits --sandbox --output-format json --print-timeout 840s` |
| Models | `gemini-4-neon-high` (the agent named by `--model`); it handed the request to a sub-agent on `gemini-4-hydrogen-tiered-high`, which called the `generate_image` tool. In the same session that tool's backend named itself `gemini-3.1-flash-image` in its capacity errors. |
| Date | 2026-11-23 |
| Generated size | 1376 × 768 JPEG, 604 KB |
| Post-processing | ImageMagick: metadata stripped, re-encoded as progressive JPEG at quality 85 (105 KB). No resize, crop or retouch. |

Request sent to `agy` (exact):

> Generate exactly one image with aspect ratio 16:9 and nothing else. Image description: A wide three-quarter view of a
> conveyor station in a clean, well-lit industrial training workshop: a belt conveyor with a silver anodised aluminium
> extrusion frame, adjustable steel legs and steel end rollers carrying a black rubber belt; small brown cardboard boxes and
> a few coloured plastic parts travelling on the belt; a diffuse photoelectric sensor on a small bracket at the side of the
> belt with a faint red light beam across it; a push-button station on a pedestal next to the conveyor; an emergency stop
> with a red mushroom button on a yellow enclosure; a stack light with red, amber and green segments on a pole; a smooth
> light grey epoxy floor. Photorealistic, realistic materials, soft natural shadows, clean and well lit, no people, no
> text, no lettering, no labels, no logos, no brand markings.

Prompt the agent passed to `generate_image` (exact, the one that produced this image):

> A photorealistic wide three-quarter view of an automated conveyor training station inside a clean, bright, modern
> industrial training workshop. At the center is a horizontal belt conveyor built with a silver anodised aluminium T-slot
> extrusion frame, supported by adjustable steel legs with round levelling feet, and steel end rollers carrying a matte
> black rubber belt. Travelling along the black belt are several small plain unbranded brown corrugated cardboard boxes and
> a few smooth solid-coloured plastic industrial parts in blue, orange, and white. Mounted on a small metal bracket on the
> near side of the conveyor frame is a compact industrial photoelectric sensor emitting a faint, thin red light beam across
> the belt. Standing beside the conveyor on a neat metal pedestal is a push-button control station with plain unlabelled
> coloured push buttons, alongside a bright yellow square enclosure housing a red mushroom-head emergency stop button.
> Rising from a slender pole attached to the station is a vertical three-colour stack light tower with red on top, amber
> in the middle, and green at the bottom. The equipment sits on a smooth, seamless light grey epoxy-coated floor. Soft
> natural shadows and even overhead workshop lighting give realistic reflections on the brushed steel, anodised aluminium,
> and epoxy floor. Clean, uncluttered workshop background. Strictly no people, no text, no lettering, no numbers, no
> labels, no logos, and no brand markings anywhere.

The agent then asked for an edit of this image that would remove the second sensor; that call failed with a capacity error
and produced no image, so this file is the first generation.

Review (2026-11-23): no text, numbers, marks or logos are visible. It draws two photoelectric sensors where one was asked for;
the far one sends the beam across the belt. It is kept as a reference for frame, legs, belt, sensor, push-button pedestal,
emergency stop, stack light, lighting and floor, not for the sensor count.
