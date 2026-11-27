/**
 * Page side of scripts/plant/capture.ts: draws one scene in one state, display mode, quality level and size and returns the frame as
 * a PNG data URL, composes labelled contact sheets, and measures the frame rate of a scene left running. See stage.ts for the method.
 */
import type { CameraPreset, PlantSceneFile } from '../../src/plant/contracts';
import type { DisplayMode } from '../../src/plant/view/displayModes';
import type { QualityLevel } from '../../src/plant/view/quality';
import { draw, frames, openStage, partRect, pngOf, type Rect, type Stage } from './stage';

export interface ShotSpec {
  /** A shipped scene by id, or a scene file of the capture's own (a fixture such as sensorKinds.scene.json). */
  scene: string | PlantSceneFile;
  quality: QualityLevel;
  mode: DisplayMode;
  width: number;
  height: number;
  reducedMotion?: boolean;
  /** A state the scene is put in before the frame is taken (see STATES); 'rest' leaves it as it loads. */
  state: string;
  /** A part view whose projected box is returned with the frame, for a close-up on a contact sheet. */
  focus?: string;
  /** A camera of the capture's own, added as a preset of the scene in the page (the file does not change); default the fitted view. */
  camera?: Omit<CameraPreset, 'name'>;
}

const pulse = async (stage: Stage, signal: string) => {
  stage.core.apply({ [signal]: true });
  await stage.run(50, 5);
  stage.core.apply({ [signal]: false });
};
/** Every boolean command of the scene whose name ends with `.run`: its belts. */
const beltsOf = (stage: Stage) => stage.core.signals.filter((s) => s.direction === 'command' && /\.run$/.test(s.name)).map((s) => s.name);
const runBelts = (stage: Stage, on: boolean) => stage.core.apply(Object.fromEntries(beltsOf(stage).map((n) => [n, on])));
const emitters = (stage: Stage) => stage.core.signals.filter((s) => s.direction === 'command' && /\.emit$/.test(s.name)).map((s) => s.name);

/**
 * The states a capture can ask for. Those of belt-to-sensor follow the lesson: a box is emitted onto the belt, the belt carries it
 * into the diffuse sensor's beam. Generic states work on any scene: its belts run, its emitters emit once.
 */
export const STATES: Readonly<Record<string, (stage: Stage) => Promise<void>>> = {
  rest: async () => undefined,
  /** Belts running with an item on the way: the look of a scene at work. */
  working: async (s) => {
    for (const e of emitters(s)) await pulse(s, e);
    runBelts(s, true);
    await s.run(1200, 20);
  },
  /**
   * Every axis and rod of the scene away from rest, at positions that only the scene decides: each analogue setpoint at its own
   * mid-stroke value, each boolean command on (a pusher out, a fork raised) except the `Right` ones and the emitters. For the pictures
   * that show the geometry of a piece whose size follows an axis is the same before and after a change of how it is kept.
   */
  axes: async (s) => {
    const commands = s.core.signals.filter((c) => c.direction === 'command');
    s.core.apply(Object.fromEntries(commands.map((c, i) => [c.name, c.type === 'BOOL' ? !/Right$|\.emit$/.test(c.name) : 0.45 + 0.07 * i])));
    await s.run(1500, 20);
  },
  /** The belt has run and stopped, its box still on the way (pair with `running`, same instant). */
  stopped: async (s) => {
    await STATES.working!(s);
    runBelts(s, false);
    await s.run(10, 5);
  },
  running: async (s) => STATES.working!(s),
  /** belt-to-sensor: the box short of the beam, belt stopped. */
  clear: async (s) => {
    await pulse(s, 'Emitter1.emit');
    runBelts(s, true);
    await s.run(1600, 20);
    runBelts(s, false);
    await s.run(400, 20);
  },
  /** belt-to-sensor: the box in the beam, belt stopped. */
  detecting: async (s) => {
    await pulse(s, 'Emitter1.emit');
    runBelts(s, true);
    for (let t = 0; t < 8000 && s.core.sense()['EyeFar.detect'] !== true; t += 20) await s.run(20, 20);
    await s.run(150, 5);
    runBelts(s, false);
    await s.run(400, 20);
  },
  released: async () => undefined,
  pressed: async (s) => {
    s.core.operate('StartButton.pressed', true);
    await s.run(10, 5);
  },
};

/** Draws one frame and returns it as a PNG data URL with the size it was drawn at, and the box of the focused part. */
export async function shot(spec: ShotSpec): Promise<{ png: string; width: number; height: number; rect?: Rect }> {
  const stage = await openStage(spec.scene, spec);
  try {
    const state = STATES[spec.state];
    if (!state) throw new Error(`unknown state ${spec.state}`);
    await state(stage);
    if (spec.camera) {
      stage.scene.cameras.push({ name: 'capture', ...spec.camera });
      stage.renderer.setCameraAnimation?.(false); // jump to it; the state has already moved the bands
      stage.renderer.setCameraPreset('capture');
    }
    const image = await draw(stage);
    const rect = spec.focus ? partRect(stage, spec.focus) : null;
    return { png: pngOf(image), width: image.width, height: image.height, ...(rect ? { rect } : {}) };
  } finally {
    stage.dispose();
  }
}

export interface SheetCell {
  png: string;
  label: string;
  /** Only this part of the frame, enlarged (a close-up of one part). */
  crop?: Rect;
}

/** A contact sheet: each frame scaled into a cell of a grid, with its label above it, on a dark ground. */
export async function sheet(title: string, cells: SheetCell[], columns: number, cell: { w: number; h: number }): Promise<string> {
  const pad = 12;
  const head = 22;
  const rows = Math.ceil(cells.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * (cell.w + pad) + pad;
  canvas.height = 40 + rows * (cell.h + head + pad) + pad;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#1e1e1e';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ffffff';
  g.font = 'bold 18px sans-serif';
  g.fillText(title, pad, 28);
  g.font = 'bold 13px sans-serif';
  for (const [i, c] of cells.entries()) {
    const x = pad + (i % columns) * (cell.w + pad);
    const y = 40 + Math.floor(i / columns) * (cell.h + head + pad);
    g.fillStyle = '#ffffff';
    g.fillText(c.label, x, y + 15);
    const image = new Image();
    image.src = c.png;
    await image.decode();
    const src = c.crop ?? { x: 0, y: 0, w: image.width, h: image.height };
    const scale = Math.min(cell.w / src.w, cell.h / src.h);
    const [w, h] = [src.w * scale, src.h * scale];
    g.drawImage(image, src.x, src.y, src.w, src.h, x + (cell.w - w) / 2, y + head + (cell.h - h) / 2, w, h);
  }
  return canvas.toDataURL('image/png');
}

/**
 * The frame rate of a scene left working for `seconds`, drawn on a canvas laid out at its full size: every animation frame the plant
 * advances by the time that passed (in steps of 5 ms) and hands its snapshot to the renderer, so every frame is drawn. The belts run
 * and the emitters emit once a second. Returns the frame times the renderer itself measured and the GPU it ran on.
 */
export async function frameRate(
  scene: string,
  quality: QualityLevel,
  seconds: number,
  width: number,
  height: number,
): Promise<{ gpu: string; frames: number; mean: number; p5: number; current: number }> {
  const stage = await openStage(scene, { quality, mode: 'light', width, height, fullWindow: true });
  try {
    await stage.renderer.ready?.();
    runBelts(stage, true);
    const gl = stage.spy.gl.getContext();
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const gpu = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    let last = performance.now();
    let sinceEmit = 0;
    const times: number[] = [];
    const end = last + seconds * 1000 + 3000;
    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        const step = Math.max(5, Math.min(50, Math.round((now - last) / 5) * 5));
        last = now;
        sinceEmit += step;
        if (sinceEmit >= 1000) {
          sinceEmit = 0;
          stage.core.apply(Object.fromEntries(emitters(stage).map((n) => [n, true])));
        } else if (sinceEmit >= 50) stage.core.apply(Object.fromEntries(emitters(stage).map((n) => [n, false])));
        stage.core.advance(step);
        stage.publish();
        if (now > end - seconds * 1000) times.push(now); // the first 3 s warm up: shaders compile, textures upload
        (window as unknown as { __fpsFrames: number }).__fpsFrames = times.length;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    await frames(2);
    const deltas = times.slice(1).map((t, i) => t - times[i]!);
    const sorted = [...deltas].sort((a, b) => a - b);
    const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    return { gpu, frames: times.length, mean: 1000 / mean, p5: p95 > 0 ? 1000 / p95 : 0, current: stage.renderer.fps().current };
  } finally {
    stage.dispose();
  }
}
