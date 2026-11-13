/**
 * The 3D canvas of the plant panel: it owns the renderer and reports what VIS-006 names (no WebGL 2, a context lost and not
 * restored in 3 s, fewer than 30 frames per second for 5 s) so the panel can offer the schematic. It draws only while the
 * document is visible (spec 013 PLS-010): a hidden canvas gets no snapshot and no resize, and the renderer draws only when it
 * has something new, so no frame is made. The plant core and the session never depend on it (P14).
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { PlantSceneFile, Vec3 } from '../contracts';
import type { Catalogue } from '../core/catalogue';
import { dragPlan, pointerToGround, type DragPlan } from '../editor/pointer';
import type { SceneEditor } from '../editor/model';
import { cameraKeyAction } from '../view/camera';
import { applyDisplayPrefs, type DisplayPrefs, type DisplayTarget } from '../view/displayModes';
import type { QualityLevel } from '../view/quality';
import type { PlantRenderer } from '../view/renderer';
import type { PlantEngine } from './loadPlantEngine';
import { DEFAULT_TIMING, MIN_FPS, type CanvasFailure, type CanvasTiming, type SnapshotFeed } from './usePlantSession';

export interface PlantCanvasProps {
  engine: PlantEngine;
  scene: PlantSceneFile;
  feed: SnapshotFeed;
  visible: boolean;
  /** `undefined` lets the renderer choose from the graphics at first run. */
  quality: QualityLevel | undefined;
  display: DisplayPrefs;
  label: string;
  timing?: CanvasTiming;
  /** While a scene is edited (SCN-008): a drag that starts on a part moves it, as one undo step, and the pointer does not orbit. */
  edit?: { editor: SceneEditor; catalogue: Catalogue; onEdited(): void };
  /** The renderer once it exists, for the camera presets; undefined again when it is gone. */
  onRenderer(renderer: PlantRenderer | undefined): void;
  onFailure(failure: CanvasFailure | undefined): void;
}

// V1's renderer has no palette or camera animation yet; `applyDisplayPrefs` calls them only where they exist.
const show = (renderer: PlantRenderer, prefs: DisplayPrefs): void => applyDisplayPrefs(renderer as PlantRenderer & DisplayTarget, prefs);

// ponytail: nearest part origin within 1.5 m of the pointer's ground point; the renderer has no picking API. Footprint hit tests if parts
// overlap.
const PICK_M = 1.5;

export function PlantCanvas(props: PlantCanvasProps) {
  const { engine, scene, feed, quality, timing = DEFAULT_TIMING } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef<PlantRenderer | undefined>(undefined);
  // What the effects read without restarting the renderer.
  const visible = useRef(props.visible);
  const callbacks = useRef(props);
  // Declared before the other effects, so each of them reads the props of this render.
  useEffect(() => {
    callbacks.current = props;
    visible.current = props.visible;
  });

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let disposed = false;
    let renderer: PlantRenderer | undefined;
    const cleanups: Array<() => void> = [];
    void engine.loadRenderer(element, scene, { ...(quality ? { quality } : {}), restoreTimeoutMs: timing.lostMs }).then((result) => {
      if (disposed) return;
      if ('unavailable' in result) {
        callbacks.current.onFailure({ kind: 'unavailable', reason: result.unavailable });
        return;
      }
      renderer = result;
      live.current = result;
      callbacks.current.onRenderer(result);
      show(result, callbacks.current.display);
      const initial = feed.latest();
      if (initial && visible.current) result.setSnapshot(initial);
      cleanups.push(
        feed.subscribe((snapshot) => {
          if (visible.current) result.setSnapshot(snapshot);
        }),
      );
      let lostTimer: ReturnType<typeof setTimeout> | undefined;
      cleanups.push(() => clearTimeout(lostTimer));
      cleanups.push(
        result.onContext((event) => {
          clearTimeout(lostTimer);
          if (event === 'lost') lostTimer = setTimeout(() => callbacks.current.onFailure({ kind: 'lost' }), timing.lostMs);
          else if (event === 'unavailable') callbacks.current.onFailure({ kind: 'lost' });
        }),
      );
      // Slow frames: the rate is judged only in a window in which the plant gave the renderer enough snapshots to draw at the
      // minimum rate, since a scan interval of 100 ms alone draws ten frames a second on any graphics.
      let slowSince: number | undefined;
      let seen = feed.count();
      const sampler = setInterval(() => {
        const arrived = feed.count() - seen;
        seen = feed.count();
        const { p5 } = result.fps();
        const judged = visible.current && arrived >= MIN_FPS * (timing.sampleMs / 1000) && p5 > 0;
        if (!judged || p5 >= MIN_FPS) {
          slowSince = undefined;
          return;
        }
        slowSince ??= Date.now();
        if (Date.now() - slowSince >= timing.slowMs) callbacks.current.onFailure({ kind: 'slow' });
      }, timing.sampleMs);
      cleanups.push(() => clearInterval(sampler));
    });
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
      renderer?.dispose();
      live.current = undefined;
      callbacks.current.onRenderer(undefined);
    };
    // The renderer is rebuilt for another scene or engine, never for a quality change (see below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, scene, feed]);

  useEffect(() => {
    if (quality) live.current?.setQuality(quality);
  }, [quality]);
  useEffect(() => {
    if (live.current) show(live.current, props.display);
  }, [props.display.mode, props.display.reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Back on screen: draw the state the plant reached while the document was hidden, at the size it has now.
    const renderer = live.current;
    const element = canvas.current;
    if (!props.visible || !renderer || !element) return;
    if (element.clientWidth > 0 && element.clientHeight > 0) renderer.resize(element.clientWidth, element.clientHeight);
    const snapshot = feed.latest();
    if (snapshot) renderer.setSnapshot(snapshot);
  }, [props.visible, feed]);
  useEffect(() => {
    const element = canvas.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (visible.current && element.clientWidth > 0 && element.clientHeight > 0)
        live.current?.resize(element.clientWidth, element.clientHeight);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const action = cameraKeyAction(event.key, event.shiftKey);
    const renderer = live.current;
    if (!action || !renderer) return;
    event.preventDefault();
    if (action.kind === 'orbit') renderer.orbit(action.dxDeg, action.dyDeg);
    else if (action.kind === 'zoom') renderer.zoom(action.factor);
    else renderer.pan(action.dx, action.dz);
  };
  // Pointer: drag orbits, wheel zooms (VIS-002); the keyboard path above is the equivalent. While editing, a drag that starts
  // within PICK_M of a part moves that part instead (SCN-008); the numeric fields of the editor remain the pointer-free path.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const part = useRef<DragPlan | null>(null);
  const ground = (event: PointerEvent<HTMLCanvasElement>): Vec3 | null => {
    const renderer = live.current;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!renderer || rect.width <= 0 || rect.height <= 0) return null;
    const ndc: [number, number] = [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    ];
    return pointerToGround(ndc, renderer.cameraState(), rect.width / rect.height);
  };
  const endPart = (commit: boolean) => {
    const plan = part.current;
    if (!plan) return;
    part.current = null;
    live.current?.setGhost?.(null);
    if (!commit) return plan.cancel();
    try {
      plan.commit();
      callbacks.current.edit?.onEdited();
    } catch {
      // The plant started while the part was held: the editor refused the move, so the scene is unchanged.
    }
  };
  const startPart = (event: PointerEvent<HTMLCanvasElement>): boolean => {
    const edit = callbacks.current.edit;
    if (!edit || edit.editor.state().running) return false;
    const hit = ground(event);
    if (!hit) return false;
    let best: { id: string; d: number } | undefined;
    for (const p of edit.editor.state().scene.parts) {
      const d = Math.hypot(p.position[0] - hit[0], p.position[2] - hit[2]);
      if (d <= PICK_M && (!best || d < best.d)) best = { id: p.id, d };
    }
    if (!best) return false;
    part.current = dragPlan(edit.editor, best.id, edit.catalogue);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    return true;
  };
  return (
    <canvas
      ref={canvas}
      data-plant-canvas
      tabIndex={0}
      role="img"
      aria-label={props.label}
      className="h-full min-h-64 w-full touch-none bg-[var(--color-surface-800)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && part.current) {
          event.preventDefault();
          endPart(false);
        } else onKeyDown(event);
      }}
      onPointerDown={(event) => {
        if (startPart(event)) return;
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerMove={(event) => {
        if (part.current) {
          const hit = ground(event);
          if (!hit) return;
          try {
            part.current.move(hit);
            live.current?.setGhost?.(part.current.preview()?.position ?? hit);
          } catch {
            endPart(false);
          }
          return;
        }
        if (!drag.current) return;
        live.current?.orbit((event.clientX - drag.current.x) * 0.4, (event.clientY - drag.current.y) * 0.4);
        drag.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={() => {
        endPart(true);
        drag.current = null;
      }}
      onPointerCancel={() => {
        endPart(false);
        drag.current = null;
      }}
      onWheel={(event) => live.current?.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)}
    />
  );
}
