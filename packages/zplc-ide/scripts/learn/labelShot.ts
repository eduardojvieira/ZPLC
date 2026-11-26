/**
 * Page side of scripts/learn/machine-images.ts: draws a scene's first view with the plant renderer (scripts/plant/stage.ts) and sets a
 * label around the frame for each part, joined to the part by a leader line (labelLayout.ts), once per language.
 */
import * as THREE from 'three';
import { draw, openStage, partRect, project, type Stage } from '../plant/stage';
import {
  COMPACT_COLUMN_WIDTH_PX,
  FOOTER,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  HEADER,
  HEADER_FONT,
  HEADER_FONT_PX,
  LEGEND_FONT,
  LEGEND_FONT_PX,
  LEGEND_LINE,
  LINE,
  LINE_FONT,
  LINE_FONT_PX,
  MARGIN,
  MAX_LAYOUT_WIDTH,
  MIN_DISPLAY_TEXT_PX,
  PAD,
  READING_COLUMN_WIDTH_PX,
  TITLE_FONT,
  TITLE_FONT_PX,
  effectiveLabelTextPx,
  labelBoxesForParts,
  layoutLabels,
  type LabelLayout,
} from './labelLayout';

export {
  COMPACT_COLUMN_WIDTH_PX,
  FRAME_HEIGHT,
  FRAME_WIDTH,
  HEADER_FONT,
  HEADER_FONT_PX,
  LEGEND_FONT,
  LEGEND_FONT_PX,
  LINE_FONT,
  LINE_FONT_PX,
  MAX_LAYOUT_WIDTH,
  MIN_DISPLAY_TEXT_PX,
  READING_COLUMN_WIDTH_PX,
  TITLE_FONT,
  TITLE_FONT_PX,
  effectiveLabelTextPx,
};

export interface LabelText {
  id: string;
  title: string;
  lines: string[];
}
export interface MachineShotSpec {
  scene: string;
  width: number;
  height: number;
  /** Per language: the image's title, its legend and the label of each part. */
  pages: Record<string, { title: string; legend: string; labels: LabelText[] }>;
}

const MARGIN_TEXT = 4;

/** Splits `text` on sentence gaps (`   `) or spaces so each line fits within `maxWidth`. */
function wrapLegend(text: string, maxWidth: number, measure: CanvasRenderingContext2D): string[] {
  if (measure.measureText(text).width <= maxWidth) return [text];
  const clauses = text
    .split('   ')
    .map((part) => part.trim())
    .filter(Boolean);
  if (clauses.length > 1 && clauses.every((part) => measure.measureText(part).width <= maxWidth)) return clauses;
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure.measureText(next).width > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Where a part is on the frame: its position projected (a sensor's head, a belt's middle; the centre of a drawn box would land in
 * a sensor's beam), or the centre of its drawn box when the position is off the frame.
 */
function anchorOf(stage: Stage, id: string): [number, number] | null {
  const view = stage.core.snapshot().parts.find((part) => part.id === id);
  const at = view ? project(stage, new THREE.Vector3(...view.pose.p)) : null;
  if (at && at[0] >= 0 && at[1] >= 0 && at[0] <= stage.canvas.width && at[1] <= stage.canvas.height) return at;
  const rect = partRect(stage, id);
  return rect ? [rect.x + rect.w / 2, rect.y + rect.h / 2] : null;
}

export async function machineShot(
  spec: MachineShotSpec,
): Promise<Record<string, { png: string; layout: LabelLayout; anchors: Record<string, [number, number] | null> }>> {
  const stage = await openStage(spec.scene, { quality: 'medium', mode: 'light', width: spec.width, height: spec.height });
  try {
    const frame = await draw(stage);
    const anchors = Object.fromEntries(stage.scene.parts.map((part) => [part.id, anchorOf(stage, part.id)]));
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frame.width;
    frameCanvas.height = frame.height;
    frameCanvas.getContext('2d')!.putImageData(frame, 0, 0);
    const result: Awaited<ReturnType<typeof machineShot>> = {};
    for (const [locale, page] of Object.entries(spec.pages)) {
      const measure = document.createElement('canvas').getContext('2d')!;
      const boxes = labelBoxesForParts(page.labels, anchors, (text, font) => {
        measure.font = font;
        return measure.measureText(text).width;
      });
      const layout = layoutLabels(boxes, { w: frame.width, h: frame.height }, { maxWidth: MAX_LAYOUT_WIDTH });
      measure.font = LEGEND_FONT;
      const legendLines = wrapLegend(page.legend, layout.width - 2 * MARGIN, measure);
      const footerHeight = FOOTER + Math.max(0, legendLines.length - 1) * LEGEND_LINE;
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = HEADER + layout.height + footerHeight;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#f3f4f6';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#111827';
      g.font = HEADER_FONT;
      g.textBaseline = 'middle';
      g.fillText(page.title, MARGIN + MARGIN_TEXT, HEADER / 2);
      g.font = LEGEND_FONT;
      legendLines.forEach((line, i) => g.fillText(line, MARGIN + MARGIN_TEXT, HEADER + layout.height + FOOTER / 2 + i * LEGEND_LINE));
      g.drawImage(frameCanvas, layout.frame.x, HEADER + layout.frame.y);
      g.translate(0, HEADER);
      // Leaders first, labels over them: a white casing keeps a dark line visible on a dark part.
      for (const label of layout.labels) {
        if (!label.leader) continue;
        const [[x0, y0], [x1, y1]] = label.leader;
        for (const [width, colour] of [
          [4, '#ffffff'],
          [1.6, '#111827'],
        ] as const) {
          g.strokeStyle = colour;
          g.lineWidth = width;
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x1, y1, 5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#111827';
        g.beginPath();
        g.arc(x1, y1, 3, 0, Math.PI * 2);
        g.fill();
      }
      for (const label of layout.labels) {
        const text = page.labels.find((candidate) => candidate.id === label.id)!;
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#111827';
        g.lineWidth = 1;
        g.beginPath();
        g.roundRect(label.x + 0.5, label.y + 0.5, label.w, label.h, 4);
        g.fill();
        g.stroke();
        g.fillStyle = '#111827';
        g.textBaseline = 'top';
        g.font = TITLE_FONT;
        g.fillText(text.title, label.x + PAD, label.y + PAD);
        g.font = LINE_FONT;
        text.lines.forEach((line, i) => g.fillText(line, label.x + PAD, label.y + PAD + LINE * (i + 1)));
      }
      result[locale] = { png: canvas.toDataURL('image/png'), layout, anchors };
    }
    return result;
  } finally {
    stage.dispose();
  }
}
