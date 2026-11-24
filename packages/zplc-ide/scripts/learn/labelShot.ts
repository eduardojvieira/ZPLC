/**
 * Page side of scripts/learn/machine-images.ts: draws a scene's first view with the plant renderer (scripts/plant/stage.ts) and sets a
 * label beside the frame for each part, joined to the part by a leader line (labelLayout.ts), once per language.
 */
import * as THREE from 'three';
import { draw, openStage, partRect, project, type Stage } from '../plant/stage';
import { layoutLabels, type LabelLayout } from './labelLayout';

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

const TITLE_FONT = 'bold 15px sans-serif';
const LINE_FONT = '13px ui-monospace, Menlo, Consolas, monospace';
const LINE = 18;
const PAD = 8;
const HEADER = 40;
const FOOTER = 30;
const MARGIN_TEXT = 4;

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
      const boxes = page.labels.map((label) => {
        measure.font = TITLE_FONT;
        let w = measure.measureText(label.title).width;
        measure.font = LINE_FONT;
        for (const line of label.lines) w = Math.max(w, measure.measureText(line).width);
        return {
          id: label.id,
          anchor: anchors[label.id] ?? null,
          w: Math.ceil(w) + 2 * PAD,
          h: (1 + label.lines.length) * LINE + 2 * PAD - 4,
        };
      });
      const layout = layoutLabels(boxes, { w: frame.width, h: frame.height });
      const canvas = document.createElement('canvas');
      canvas.width = layout.width;
      canvas.height = HEADER + layout.height + FOOTER;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#f3f4f6';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#111827';
      g.font = 'bold 20px sans-serif';
      g.textBaseline = 'middle';
      g.fillText(page.title, layout.frame.x + MARGIN_TEXT, HEADER / 2);
      g.font = '14px sans-serif';
      g.fillText(page.legend, layout.frame.x + MARGIN_TEXT, HEADER + layout.height + FOOTER / 2);
      g.drawImage(frameCanvas, layout.frame.x, HEADER);
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
