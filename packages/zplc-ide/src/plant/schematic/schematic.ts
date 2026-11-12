import type { PlantSceneFile, ScenePart } from '../contracts';
import type { Catalogue } from '../core/catalogue';

export interface SchematicShape {
  id: string;
  part: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotationDeg: number;
}
export interface SchematicModel {
  width: number;
  height: number;
  shapes: readonly SchematicShape[];
  labels: readonly { x: number; y: number; text: string }[];
}

const PX_PER_M = 100;
const MARGIN = 40;
const MIN_SIDE_M = 0.4;

/** Footprint in metres: the box around the part's snap points (its own geometry), at least MIN_SIDE_M. */
function footprint(part: ScenePart, catalogue: Catalogue): { w: number; d: number } {
  const points = catalogue.get(part.part)?.snapPoints(part) ?? [];
  if (points.length === 0) return { w: MIN_SIDE_M, d: MIN_SIDE_M };
  const xs = points.map((p) => p.position[0]);
  const zs = points.map((p) => p.position[2]);
  return {
    w: Math.max(MIN_SIDE_M, Math.max(...xs) - Math.min(...xs)),
    d: Math.max(MIN_SIDE_M, Math.max(...zs) - Math.min(...zs)),
  };
}

/** Top-down projection of a scene (x to the right, z down), generated from the catalogue; nothing is drawn per scene. */
export function schematicFor(scene: PlantSceneFile, catalogue: Catalogue): SchematicModel {
  const boxes = scene.parts.map((p) => {
    const f = footprint(p, catalogue);
    return { p, cx: p.position[0] * PX_PER_M, cy: p.position[2] * PX_PER_M, w: f.w * PX_PER_M, h: f.d * PX_PER_M };
  });
  // Rotation is drawn as a transform, so the extent is the circle around each footprint.
  const reach = (b: (typeof boxes)[number]) => Math.hypot(b.w, b.h) / 2;
  const minX = Math.min(0, ...boxes.map((b) => b.cx - reach(b)));
  const minY = Math.min(0, ...boxes.map((b) => b.cy - reach(b)));
  const maxX = Math.max(0, ...boxes.map((b) => b.cx + reach(b)));
  const maxY = Math.max(0, ...boxes.map((b) => b.cy + reach(b)));
  const ox = MARGIN - minX;
  const oy = MARGIN - minY;
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    width: round(maxX - minX + 2 * MARGIN),
    height: round(maxY - minY + 2 * MARGIN),
    shapes: boxes.map((b) => ({
      id: b.p.id,
      part: b.p.part,
      x: round(b.cx + ox - b.w / 2),
      y: round(b.cy + oy - b.h / 2),
      w: round(b.w),
      h: round(b.h),
      rotationDeg: b.p.rotationYDeg,
    })),
    labels: boxes.map((b) => ({ x: round(b.cx + ox), y: round(b.cy + oy + b.h / 2 + 14), text: b.p.name })),
  };
}
