/**
 * Where the labels of a labelled scene image go (machine-images.ts): a pure function, so the page that draws the image and the test
 * that checks the layout run the same code. The rendered frame stays whole in the middle; the labels stand in a column on each side
 * of it, never on the plant, each joined to its part by a leader line. A label goes to the side of its part, sorted top to bottom by
 * the height of the part, and is pushed down (then up, at the bottom) just enough not to touch its neighbour. A column taller than
 * the frame first hands the labels nearest the middle to the other column, then makes the image taller. Two labels of a column whose
 * leader lines cross swap places until none do.
 * ponytail: a bounded number of swaps, and a leader of the left column can still cross one of the right column over the frame;
 * `crossings` counts them so a run reports it.
 */
export interface LabelBox {
  id: string;
  /** The part's position on the rendered frame, in its pixels; null when the part is not drawn or is behind the camera. */
  anchor: [number, number] | null;
  w: number;
  h: number;
}
export interface PlacedLabel extends LabelBox {
  side: 'left' | 'right';
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

export const MARGIN = 14;
export const GAP = 8;

const need = (column: readonly LabelBox[]) =>
  column.reduce((sum, label) => sum + label.h, 0) + GAP * Math.max(0, column.length - 1) + 2 * MARGIN;
const byHeight = (a: LabelBox, b: LabelBox) =>
  (a.anchor?.[1] ?? Number.POSITIVE_INFINITY) - (b.anchor?.[1] ?? Number.POSITIVE_INFINITY) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Lays out `labels` beside a frame of `frame.w` by `frame.h` pixels. */
export function layoutLabels(labels: readonly LabelBox[], frame: { w: number; h: number }): LabelLayout {
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
      const ys: number[] = [];
      // Down: each label as near its part as it can be, below the one above it.
      order.forEach((label, i) => {
        const wanted = label.anchor ? label.anchor[1] - label.h / 2 : MARGIN;
        ys[i] = Math.max(wanted, MARGIN, i === 0 ? MARGIN : ys[i - 1]! + order[i - 1]!.h + GAP);
      });
      // Up: the bottom ones back inside the image, each above the one below it.
      for (let i = order.length - 1; i >= 0; i--) {
        const limit = i === order.length - 1 ? height - MARGIN - order[i]!.h : ys[i + 1]! - GAP - order[i]!.h;
        ys[i] = Math.min(ys[i]!, limit);
      }
      return order.map((label, i) => {
        const edge: [number, number] = [side === 'left' ? x + label.w : x, ys[i]! + label.h / 2];
        return { ...label, side, x, y: ys[i]!, leader: label.anchor ? [edge, [frameX + label.anchor[0], label.anchor[1]]] : null };
      });
    };
    // Two leaders that cross swap their labels, until none cross; a bounded number of times, in case a swap brings one back.
    const order = [...column].sort(byHeight);
    let result = place(order);
    for (let turn = 0; turn < order.length * order.length; turn++) {
      const pair = crossing(result);
      if (!pair) break;
      [order[pair[0]], order[pair[1]]] = [order[pair[1]]!, order[pair[0]]!];
      result = place(order);
    }
    placed.push(...result);
  }
  return { width: frameX + frame.w + gutter(right), height, frame: { x: frameX, y: 0, ...frame }, labels: placed };
}

type Segment = [[number, number], [number, number]];
const turn = (a: [number, number], b: [number, number], c: [number, number]) =>
  Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
const cross = ([a, b]: Segment, [c, d]: Segment) => turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;

/** The first two labels of a column, by index, whose leader lines cross. */
function crossing(column: readonly PlacedLabel[]): [number, number] | undefined {
  for (let i = 0; i < column.length; i++)
    for (let j = i + 1; j < column.length; j++)
      if (column[i]!.leader && column[j]!.leader && cross(column[i]!.leader!, column[j]!.leader!)) return [i, j];
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
