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

## concept-sensor.jpg

| Field | Value |
|---|---|
| Tool | Antigravity CLI (`agy`) 1.5.15, run in an empty directory outside the repository: `agy -p "<request>" --model gemini-4-neon-high --mode accept-edits --sandbox --output-format json --print-timeout 840s` |
| Models | `gemini-4-neon-high` (the agent named by `--model`); it handed the request to a sub-agent on `gemini-4-hydrogen-tiered-high`, which called the `generate_image` tool. In the same session that tool's backend named itself `gemini-3.1-flash-image` in its capacity errors. |
| Date | 2026-11-23 |
| Generated size | 1376 × 768 JPEG, 736 KB |
| Post-processing | ImageMagick: metadata stripped, re-encoded as progressive JPEG at quality 85 (159 KB). No resize, crop or retouch. |

Request sent to `agy` (exact):

> Generate exactly one image with aspect ratio 16:9 and nothing else. Image description: A close-up of a small
> diffuse photoelectric sensor in a compact grey housing, mounted on a bent steel bracket at the side of a belt
> conveyor with a silver aluminium frame and a black rubber belt; a thin faint red light beam crosses the belt and a
> brown cardboard box approaches it; shallow depth of field, clean industrial training workshop in the background.
> Photorealistic, realistic materials, soft natural shadows, clean and well lit, no people, no text, no lettering, no
> labels, no logos, no brand markings.
The agent made two `generate_image` calls, each a new image from text. This file is the first. Its prompt (exact):

> Close-up photorealistic industrial photograph of a small diffuse photoelectric sensor in a compact unbranded matte
> grey plastic housing, mounted with small hex bolts onto a bent brushed stainless steel L-bracket bolted to the side
> of a belt conveyor. The conveyor has a clean silver anodized T-slot extruded aluminum frame and a textured matte
> black rubber conveyor belt. A thin, subtle, faint red optical light beam projects horizontally from the tiny glass
> sensor lens straight across the surface of the black rubber belt. A completely plain, unprinted brown corrugated
> cardboard box sits on the black belt, approaching the path of the red beam. Shallow depth of field with crisp sharp
> focus on the matte grey sensor housing, brushed steel bracket, faint red beam, and the edge of the approaching
> cardboard box. The background shows a clean, bright, well-lit modern industrial automation training workshop softly
> out of focus with natural bokeh. Natural soft overhead workshop lighting with gentle realistic shadows, authentic
> industrial metal, matte plastic, rubber, and corrugated paper textures. Shot on a 50mm macro prime lens, f/2.8.
> Completely free of any people, text, letters, numbers, markings, labels, stickers, logos, or branding anywhere on
> the sensor, bracket, conveyor, box, or background.

The second call (`photoelectric_sensor_conveyor_v2`) asked for the lens to face straight across the belt; its image draws two red lines, one across the belt and one along it, so it is not kept. Its prompt (exact):

> Close-up photorealistic industrial photograph looking slightly down and along a belt conveyor. Mounted to the near
> side of the conveyor's silver anodized T-slot extruded aluminum frame is a bent brushed stainless steel L-bracket
> holding a small, compact, unbranded matte grey plastic diffuse photoelectric sensor. The sensor is oriented
> perpendicular to the conveyor rail so its tiny dark optical lens faces straight across the width of the textured
> black rubber belt toward the far edge. Projecting from the sensor lens is a thin, faint, straight red laser light
> beam stretching horizontally straight across the black rubber belt. A few centimeters further along the belt, a
> completely plain, unprinted brown corrugated cardboard box sits on the black rubber belt, approaching the path of
> the red beam just before crossing it. Shallow depth of field focusing sharply on the matte grey sensor, brushed
> steel bracket, faint red beam across the belt, and the leading edge of the approaching cardboard box. Clean,
> well-lit modern industrial automation training workshop softly blurred in the background with no people. Soft
> natural overhead workshop lighting, realistic shadows, authentic metal, matte plastic, rubber, and cardboard
> textures. Strictly no people, no text, no lettering, no numbers, no labels, no stickers, no logos, and no brand
> markings anywhere on the sensor, bracket, box, conveyor, or background.

Review (2026-11-23): no text, marks or logos are visible. Right: a compact grey sensor on a bent stainless bracket bolted to the aluminium frame, a faint red beam that reaches the approaching box, the belt and the box. Wrong or weak: the belt reads as a coarse fabric rather than rubber, and the beam is very faint (a rendered view needs a clearer one, VIS-016). The pneumatic units in the background are not plant parts.

## concept-controls.jpg

| Field | Value |
|---|---|
| Tool | Antigravity CLI (`agy`) 1.5.15, run in an empty directory outside the repository: `agy -p "<request>" --model gemini-4-neon-high --mode accept-edits --sandbox --output-format json --print-timeout 840s` |
| Models | `gemini-4-neon-high` (the agent named by `--model`); it handed the request to a sub-agent on `gemini-4-hydrogen-tiered-high`, which called the `generate_image` tool. In the same session that tool's backend named itself `gemini-3.1-flash-image` in its capacity errors. |
| Date | 2026-11-23 |
| Generated size | 1376 × 768 JPEG, 650 KB |
| Post-processing | ImageMagick: metadata stripped, re-encoded as progressive JPEG at quality 85 (123 KB). No resize, crop or retouch. |

Request sent to `agy` (exact):

> Generate exactly one image with aspect ratio 16:9 and nothing else. Image description: A control station on a steel
> pedestal beside a belt conveyor in a clean industrial training workshop: a powder-coated grey enclosure with a
> green push button and a black push button, next to it an emergency stop with a red mushroom button on a yellow
> enclosure, and behind them a stack light with red, amber and green segments on a slim pole; the conveyor with a
> silver aluminium frame and a black rubber belt is visible beside it. Photorealistic, realistic materials, soft
> natural shadows, clean and well lit, no people, no text, no lettering, no labels, no logos, no brand markings.
Prompt the agent passed to `generate_image` (exact, the only call):

> A photorealistic wide-angle photograph inside a clean, well-lit industrial training workshop. In the foreground on
> the left, a sturdy brushed steel pedestal supports an industrial control station consisting of two adjacent control
> boxes: a matte powder-coated grey metal enclosure featuring one circular green flush push button and one circular
> black flush push button side by side, and immediately next to it a bright yellow square enclosure featuring a
> single large red mushroom-head emergency stop button. Rising directly behind the enclosures is a slim metallic pole
> topped with a cylindrical industrial stack light having three distinct stacked translucent segments in red on top,
> amber in the middle, and green at the bottom. Immediately beside the pedestal on the right runs a horizontal belt
> conveyor constructed with a silver anodized aluminium extrusion frame and a flat matte black rubber conveyor belt.
> The background shows a tidy, modern industrial training workshop with a clean light-grey floor, soft overhead
> diffused lighting casting gentle natural shadows, and blurred clean workshop walls with zero signage. Realistic
> industrial materials and textures, crisp focus on the control station and conveyor, completely empty of people.
> Every surface, enclosure, push button, conveyor frame, and background wall is completely blank and unmarked, with
> absolutely no text, no letters, no numbers, no symbols, no labels, no decals, no logos, and no brand markings
> anywhere.

Review (2026-11-23): no text, marks or logos are visible. Right: a grey enclosure with a green and a black push button, an emergency stop with a red mushroom button on a yellow enclosure, a stack light with red, amber and green segments on a slim pole, the conveyor end beside it with its roller and cable tray. Wrong or weak: the pedestal is a wide stainless cabinet rather than a slim column.

## concept-conveyor-detail.jpg

| Field | Value |
|---|---|
| Tool | Antigravity CLI (`agy`) 1.5.15, run in an empty directory outside the repository: `agy -p "<request>" --model gemini-4-neon-high --mode accept-edits --sandbox --output-format json --print-timeout 840s` |
| Models | `gemini-4-neon-high` (the agent named by `--model`); it handed the request to a sub-agent on `gemini-4-hydrogen-tiered-high`, which called the `generate_image` tool. In the same session that tool's backend named itself `gemini-3.1-flash-image` in its capacity errors. |
| Date | 2026-11-23 |
| Generated size | 1376 × 768 JPEG, 726 KB |
| Post-processing | ImageMagick: metadata stripped, re-encoded as progressive JPEG at quality 85 (154 KB). No resize, crop or retouch. |

Request sent to `agy` (exact):

> Generate exactly one image with aspect ratio 16:9 and nothing else. Image description: A low-angle detail of the
> discharge end of a belt conveyor: silver anodised aluminium extrusion frame with T-slots, a steel end roller, a
> black rubber belt wrapping the roller, adjustable steel legs with levelling feet standing on a smooth grey epoxy
> floor, brown cardboard boxes and small coloured moulded plastic parts on the belt, soft overhead light.
> Photorealistic, realistic materials, soft natural shadows, clean and well lit, no people, no text, no lettering, no
> labels, no logos, no brand markings.
The agent made two `generate_image` calls, each a new image from text. This file is the second (`conveyor_discharge_detail_v2`). Its prompt (exact):

> Photorealistic low-angle detail photograph of the discharge end of an industrial belt conveyor in a clean, well-lit
> modern workshop. Shot from a low three-quarter angle near floor level looking up slightly toward the discharge end.
> The horizontal conveyor bed has a symmetrical silver anodised aluminium extrusion frame with crisp T-slot channels
> on both the near and far sides, joined cleanly to matching bearing blocks at the discharge end. A machined brushed
> steel cylindrical end roller spans evenly between the bearing blocks, with a matte black rubber conveyor belt
> wrapping smoothly and tautly around the steel roller. Supporting the aluminium frame are sturdy adjustable steel
> legs made of dark grey painted or brushed tubular steel with height-adjustment telescoping inner posts and threaded
> steel levelling feet with black rubber pads resting squarely on a smooth, slightly satin grey epoxy floor. Resting
> on the top surface of the black rubber belt near the discharge end are two plain unlabelled brown corrugated
> cardboard boxes and several small colourful injection-moulded plastic parts in red, blue, green, and yellow. Soft,
> even overhead industrial LED lighting casts gentle, natural diffused shadows onto the smooth grey epoxy floor.
> Photorealistic materials, sharp focus on the aluminium T-slot frame, steel end roller, black rubber belt, steel
> legs, and levelling feet, with a softly blurred clean factory background. No people, no text, no lettering, no
> labels, no stickers, no logos, and no brand markings anywhere.

The first call (`conveyor_discharge_detail`) drew an end roller far taller than the frame, so it is not kept. Its prompt (exact):

> Photorealistic low-angle detail photograph of the discharge end of an industrial belt conveyor in a clean, well-lit
> manufacturing facility. Shot from a low three-quarter perspective looking slightly up at the discharge end of the
> conveyor. The conveyor frame is constructed from silver anodised aluminium extrusion profiles with crisp T-slot
> channels, corner brackets, and stainless steel fasteners. At the discharge end, a machined brushed steel end roller
> is mounted in bearing blocks, with a matte black textured rubber conveyor belt tightly wrapping around the roller.
> Supporting the frame are adjustable steel legs fitted with black and steel levelling feet resting firmly on a
> smooth, slightly reflective grey epoxy floor. Resting on the black rubber belt near the discharge end are a couple
> of plain brown corrugated cardboard boxes alongside small colourful injection-moulded plastic parts in red, blue,
> and yellow. Soft, diffused overhead industrial lighting illuminates the scene evenly, casting soft natural shadows
> under the conveyor and onto the grey epoxy floor. Realistic metallic, rubber, cardboard, and plastic textures,
> sharp focus on the aluminium T-slot extrusion, steel roller, belt edge, and levelling feet with gentle
> depth-of-field falloff in the clean blurred factory background. Completely free of any people, text, lettering,
> labels, stickers, logos, or brand markings.

Review (2026-11-23): no text, marks or logos are visible. Right: the T-slot aluminium frame, the steel end roller in bearing blocks with the belt wrapped around it, painted tubular legs with threaded levelling feet, the epoxy floor and the boxes. Wrong or weak: the small coloured parts look like toy building bricks; they are not a model for the plant items, which stay plain shapes (P17).
