/**
 * Where the labels of a labelled scene image go (machine-images.ts): a pure function, so the page that draws the image and the test
 * that checks the layout run the same code. The rendered frame stays whole; labels stand either in side columns (`sides`) or, when
 * side gutters would exceed `maxWidth`, in horizontal rows above and below the frame (`bands`), never covering the plant.
 */
export type LabelSide = 'left' | 'right' | 'top' | 'bottom';

export interface LabelBox {
  id: string;
  /** The part's position on the rendered frame, in its pixels; null when the part is not drawn or is behind the camera. */
  anchor: [number, number] | null;
  w: number;
  h: number;
}
export interface PlacedLabel extends LabelBox {
  side: LabelSide;
  x: number;
  y: number;
  /** The leader line, from the label's inner edge to the part, in image pixels; null without an anchor. */
  leader: [[number, number], [number, number]] | null;
}
export interface LabelLayout {
  width: number;
  height: number;
  /** Where the rendered frame is drawn in the image. */
  frame: { x: number; y: number; w: number; h: number };
  labels: PlacedLabel[];
}
export interface LayoutOptions {
  /** Maximum total width; when side columns would exceed it, labels move into bands above and below the frame. */
  maxWidth?: number;
  mode?: 'sides' | 'bands' | 'auto';
}
export interface LabelTextInput {
  id: string;
  title: string;
  lines: string[];
}

export const MARGIN = 14;
export const GAP = 8;
export const FRAME_WIDTH = 960;
export const FRAME_HEIGHT = 540;
export const TITLE_FONT_PX = 24;
export const LINE_FONT_PX = 22;
export const HEADER_FONT_PX = 24;
export const LEGEND_FONT_PX = 22;
export const TITLE_FONT = `bold ${TITLE_FONT_PX}px sans-serif`;
export const LINE_FONT = `${LINE_FONT_PX}px ui-monospace, Menlo, Consolas, monospace`;
export const HEADER_FONT = `bold ${HEADER_FONT_PX}px sans-serif`;
export const LEGEND_FONT = `${LEGEND_FONT_PX}px sans-serif`;
export const LINE = 28;
export const PAD = 10;
export const HEADER = 48;
export const FOOTER = 44;
export const LEGEND_LINE = 28;
export const MAX_LAYOUT_WIDTH = 1050;
export const MIN_DISPLAY_TEXT_PX = 12;
export const READING_COLUMN_WIDTH_PX = 618;
export const COMPACT_COLUMN_WIDTH_PX = 600;

/** Effective CSS pixel height of image text when the image of `layoutWidth` is scaled to `columnWidthPx`. */
export function effectiveLabelTextPx(
  layoutWidth: number,
  columnWidthPx: number = READING_COLUMN_WIDTH_PX,
  fontPx: number = LINE_FONT_PX,
): number {
  return fontPx * Math.min(1, columnWidthPx / layoutWidth);
}

/** Conservative pixel width estimate for text when no browser Canvas 2D context is available. */
export function estimateTextWidth(text: string, fontPx: number, mono = false): number {
  return Math.ceil(text.length * fontPx * (mono ? 0.6 : 0.58));
}

/** Builds label boxes for `partLabels` using either a Canvas 2D measurer or `estimateTextWidth`. */
export function labelBoxesForParts(
  labels: readonly LabelTextInput[],
  anchors: Record<string, [number, number] | null>,
  measure?: (text: string, font: string) => number,
): LabelBox[] {
  const widthOf = (text: string, font: string, fontPx: number, mono: boolean): number =>
    measure ? measure(text, font) : estimateTextWidth(text, fontPx, mono);
  return labels.map((label) => {
    let w = widthOf(label.title, TITLE_FONT, TITLE_FONT_PX, false);
    for (const line of label.lines) w = Math.max(w, widthOf(line, LINE_FONT, LINE_FONT_PX, true));
    return {
      id: label.id,
      anchor: anchors[label.id] ?? null,
      w: Math.ceil(w) + 2 * PAD,
      h: (1 + label.lines.length) * LINE + 2 * PAD - 6,
    };
  });
}

const need = (column: readonly LabelBox[]) =>
  column.reduce((sum, label) => sum + label.h, 0) + GAP * Math.max(0, column.length - 1) + 2 * MARGIN;
const byCoord = (axis: 0 | 1) => (a: LabelBox, b: LabelBox) =>
  (a.anchor?.[axis] ?? Number.POSITIVE_INFINITY) - (b.anchor?.[axis] ?? Number.POSITIVE_INFINITY) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Packs `order` along a 1D interval `[MARGIN, limit - MARGIN]` near `wanted(label)`, keeping `>= GAP` between neighbors. */
function packAlong(
  order: readonly LabelBox[],
  sizeOf: (label: LabelBox) => number,
  wanted: (label: LabelBox) => number,
  limit: number,
): number[] {
  const pos: number[] = [];
  order.forEach((label, i) => {
    const prevEnd = i === 0 ? MARGIN : pos[i - 1]! + sizeOf(order[i - 1]!) + GAP;
    pos[i] = Math.max(wanted(label), MARGIN, prevEnd);
  });
  for (let i = order.length - 1; i >= 0; i--) {
    const maxPos = i === order.length - 1 ? limit - MARGIN - sizeOf(order[i]!) : pos[i + 1]! - GAP - sizeOf(order[i]!);
    pos[i] = Math.min(pos[i]!, maxPos);
  }
  return pos;
}

/** Runs `place` and swaps adjacent crossing leaders up to `order.length^2` times until none cross within the group. */
function uncrossGroup(initial: LabelBox[], place: (order: readonly LabelBox[]) => PlacedLabel[]): PlacedLabel[] {
  const order = [...initial];
  let result = place(order);
  for (let turn = 0; turn < order.length * order.length; turn++) {
    const pair = crossing(result);
    if (!pair) break;
    [order[pair[0]], order[pair[1]]] = [order[pair[1]]!, order[pair[0]]!];
    result = place(order);
  }
  return result;
}

function layoutSides(labels: readonly LabelBox[], frame: { w: number; h: number }): LabelLayout {
  const middle = frame.w / 2;
  const left: LabelBox[] = [];
  const right: LabelBox[] = [];
  for (const label of labels) {
    if (label.anchor) (label.anchor[0] < middle ? left : right).push(label);
    else (need(left) <= need(right) ? left : right).push(label);
  }
  // A column taller than the frame gives the label nearest the middle to the other column while that one stays within the frame.
  const distance = (label: LabelBox) => Math.abs((label.anchor?.[0] ?? middle) - middle);
  for (const [from, to] of [
    [left, right],
    [right, left],
  ] as const) {
    while (need(from) > frame.h && from.length > 1) {
      const nearest = [...from].sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : 1))[0]!;
      if (need([...to, nearest]) > frame.h) break;
      from.splice(from.indexOf(nearest), 1);
      to.push(nearest);
    }
  }
  const height = Math.max(frame.h, need(left), need(right));
  const gutter = (column: readonly LabelBox[]) => (column.length === 0 ? 0 : Math.max(...column.map((label) => label.w)) + 2 * MARGIN);
  const frameX = gutter(left);
  const placed: PlacedLabel[] = [];
  for (const [side, column] of [
    ['left', left],
    ['right', right],
  ] as const) {
    const x = side === 'left' ? MARGIN : frameX + frame.w + MARGIN;
    const place = (order: readonly LabelBox[]): PlacedLabel[] => {
      const ys = packAlong(
        order,
        (label) => label.h,
        (label) => (label.anchor ? label.anchor[1] - label.h / 2 : MARGIN),
        height,
      );
      return order.map((label, i) => {
        const edge: [number, number] = [side === 'left' ? x + label.w : x, ys[i]! + label.h / 2];
        return { ...label, side, x, y: ys[i]!, leader: label.anchor ? [edge, [frameX + label.anchor[0], label.anchor[1]]] : null };
      });
    };
    placed.push(...uncrossGroup([...column].sort(byCoord(1)), place));
  }
  return { width: frameX + frame.w + gutter(right), height, frame: { x: frameX, y: 0, ...frame }, labels: placed };
}

function packRows(band: readonly LabelBox[], stripWidth: number, frameX: number): LabelBox[][] {
  if (band.length === 0) return [];
  const maxRight = stripWidth - MARGIN;
  const usable = maxRight - MARGIN;
  const minTotal = band.reduce((sum, label) => sum + label.w, 0) + GAP * Math.max(0, band.length - 1);
  const minRows = Math.max(1, Math.ceil(minTotal / usable));
  const rows: Array<{ items: LabelBox[]; end: number }> = Array.from({ length: minRows }, () => ({
    items: [],
    end: MARGIN,
  }));
  for (const label of [...band].sort(byCoord(0))) {
    const wanted = label.anchor ? Math.max(MARGIN, frameX + label.anchor[0] - label.w / 2) : MARGIN;
    let bestRow: { items: LabelBox[]; end: number } | undefined;
    let bestShift = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const start = row.items.length === 0 ? MARGIN : row.end + GAP;
      if (start + label.w > maxRight) continue;
      const shift = Math.abs(Math.max(start, Math.min(wanted, maxRight - label.w)) - wanted);
      if (shift < bestShift) {
        bestShift = shift;
        bestRow = row;
      }
    }
    if (!bestRow) {
      bestRow = { items: [], end: MARGIN };
      rows.push(bestRow);
    }
    const start = bestRow.items.length === 0 ? MARGIN : bestRow.end + GAP;
    const placedAt = Math.min(Math.max(start, wanted), maxRight - label.w);
    bestRow.items.push(label);
    bestRow.end = placedAt + label.w;
  }
  return rows.filter((row) => row.items.length > 0).map((row) => row.items);
}

function layoutBands(labels: readonly LabelBox[], frame: { w: number; h: number }): LabelLayout {
  const middleY = frame.h / 2;
  const top: LabelBox[] = [];
  const bottom: LabelBox[] = [];
  for (const label of labels) {
    if (label.anchor) (label.anchor[1] < middleY ? top : bottom).push(label);
    else (top.length < bottom.length ? top : bottom).push(label);
  }
  // Balance middle-band labels across top and bottom without crossing outer-edge parts over the machine.
  while (top.length - bottom.length >= 2) {
    const candidate = [...top]
      .filter((l) => l.anchor && l.anchor[1] >= frame.h * 0.25)
      .sort(byCoord(1))
      .at(-1);
    if (!candidate) break;
    top.splice(top.indexOf(candidate), 1);
    bottom.push(candidate);
  }
  while (bottom.length - top.length >= 2) {
    const candidate = [...bottom].filter((l) => l.anchor && l.anchor[1] <= frame.h * 0.75).sort(byCoord(1))[0];
    if (!candidate) break;
    bottom.splice(bottom.indexOf(candidate), 1);
    top.push(candidate);
  }
  const stripWidth = Math.max(frame.w + 2 * MARGIN, ...labels.map((label) => label.w + 2 * MARGIN));
  const frameX = Math.round((stripWidth - frame.w) / 2);
  const topRows = packRows(top, stripWidth, frameX);
  const bottomRows = packRows(bottom, stripWidth, frameX);
  const rowHeight = (row: readonly LabelBox[]) => Math.max(...row.map((label) => label.h));
  const bandHeight = (rows: readonly LabelBox[][]) =>
    rows.length === 0 ? 0 : 2 * MARGIN + rows.reduce((sum, row) => sum + rowHeight(row), 0) + GAP * (rows.length - 1);
  const frameY = bandHeight(topRows);
  const placed: PlacedLabel[] = [];
  const placeBand = (side: 'top' | 'bottom', rows: readonly LabelBox[][], startY: number): void => {
    let y = startY;
    for (const row of rows) {
      const h = rowHeight(row);
      const place = (order: readonly LabelBox[]): PlacedLabel[] => {
        const xs = packAlong(
          order,
          (label) => label.w,
          (label) => (label.anchor ? frameX + label.anchor[0] - label.w / 2 : MARGIN),
          stripWidth,
        );
        return order.map((label, i) => {
          const x = xs[i]!;
          const edge: [number, number] = [x + label.w / 2, side === 'top' ? y + label.h : y];
          return {
            ...label,
            side,
            x,
            y,
            leader: label.anchor ? [edge, [frameX + label.anchor[0], frameY + label.anchor[1]]] : null,
          };
        });
      };
      placed.push(...uncrossGroup(row, place));
      y += h + GAP;
    }
  };
  placeBand('top', topRows, MARGIN);
  placeBand('bottom', bottomRows, frameY + frame.h + MARGIN);
  return {
    width: stripWidth,
    height: frameY + frame.h + bandHeight(bottomRows),
    frame: { x: frameX, y: frameY, ...frame },
    labels: placed,
  };
}

/** Lays out `labels` around a frame of `frame.w` by `frame.h` pixels, switching to bands if `maxWidth` would be exceeded. */
export function layoutLabels(labels: readonly LabelBox[], frame: { w: number; h: number }, options?: LayoutOptions): LabelLayout {
  const mode = options?.mode ?? 'auto';
  if (mode === 'bands') return layoutBands(labels, frame);
  const sides = layoutSides(labels, frame);
  if (mode === 'sides' || options?.maxWidth === undefined || sides.width <= options.maxWidth) return sides;
  return layoutBands(labels, frame);
}

type Segment = [[number, number], [number, number]];
const turn = (a: [number, number], b: [number, number], c: [number, number]) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const cross = ([a, b]: Segment, [c, d]: Segment) => turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

/** The first two labels of a group, by index, whose leader lines cross. */
function crossing(group: readonly PlacedLabel[]): [number, number] | undefined {
  for (let i = 0; i < group.length; i++)
    for (let j = i + 1; j < group.length; j++)
      if (group[i]!.leader && group[j]!.leader && cross(group[i]!.leader!, group[j]!.leader!)) return [i, j];
  return undefined;
}

/** How many pairs of leader lines cross, in the whole image. */
export const crossings = (layout: LabelLayout): number =>
  layout.labels.reduce(
    (sum, a, i) => sum + layout.labels.slice(i + 1).filter((b) => a.leader && b.leader && cross(a.leader, b.leader)).length,
    0,
  );

/** The pairs of labels whose boxes overlap, and the labels that leave the image or cover the frame: empty for a good layout. */
export function layoutProblems(layout: LabelLayout): string[] {
  const problems: string[] = [];
  const { frame } = layout;
  for (const [i, a] of layout.labels.entries()) {
    if (a.x < 0 || a.y < 0 || a.x + a.w > layout.width || a.y + a.h > layout.height) problems.push(`${a.id} leaves the image`);
    if (a.x < frame.x + frame.w && a.x + a.w > frame.x && a.y < frame.y + frame.h && a.y + a.h > frame.y)
      problems.push(`${a.id} covers the frame`);
    for (const b of layout.labels.slice(i + 1))
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) problems.push(`${a.id} overlaps ${b.id}`);
  }
  return problems;
}
