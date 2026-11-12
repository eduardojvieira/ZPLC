/**
 * What the plant panel binds to (Task V4): the plant core of the chosen scene, the lock-step session over the simulation the
 * controller holds, and the snapshot both feed. While a session is bound it is the command bar's transport (spec 013 PLS-003,
 * contract C8); when the scene changes, the program is replaced or the panel closes, the transport is unregistered and the
 * session stopped, so a press of Run never drives a session nobody shows.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { DebugController } from '../../hooks/debugControllerTypes';
import { validatePlantMap, type PlantMapV2 } from '../../plants/plantMap';
import { listIoMap } from '../../runtime/ioMap';
import { plantTransport, type TransportState } from '../../runtime/transport';
import { useIDEStore } from '../../store/useIDEStore';
import { registerPlantTransport } from '../../store/useTransport';
import { announce } from '../../utils/announce';
import type { PlantCore, PlantSceneFile, PlantSnapshot } from '../contracts';
import { parseScene } from '../core/scene';
import { createPlantSession, type PlantSessionHandle, type PlantSessionPorts } from '../session/plantSession';
import { loadPlantEngine, type PlantEngine } from './loadPlantEngine';

export type SceneRef = { kind: 'project' } | { kind: 'shipped'; id: string };

/** What a test replaces: the engine (three and Jolt) and the session factory. */
export interface PlantPanelDeps {
  loadEngine?: () => Promise<PlantEngine>;
  createSession?: (ports: PlantSessionPorts) => PlantSessionHandle;
}

type RuntimePort = PlantSessionPorts['runtime'];

/** The native runtime adapter has the scan-stepping calls of contract C5; a serial or plain adapter does not. */
const isRuntimePort = (adapter: unknown): adapter is RuntimePort =>
  typeof adapter === 'object' &&
  adapter !== null &&
  ['setClockMode', 'scenarioStep', 'getInfo', 'peek', 'pokeN', 'reset'].every(
    (name) => typeof (adapter as Record<string, unknown>)[name] === 'function',
  );

const parseMap = (text: string): PlantMapV2 | undefined => {
  try {
    const value: unknown = JSON.parse(text);
    return validatePlantMap(value).length === 0 && (value as { schemaVersion?: unknown }).schemaVersion === 2
      ? (value as PlantMapV2)
      : undefined;
  } catch {
    return undefined;
  }
};

type Load =
  | { phase: 'loading' }
  | { phase: 'failed'; detail: string }
  | { phase: 'ready'; engine: PlantEngine; scene: PlantSceneFile; core: PlantCore; map: PlantMapV2 | undefined };

/** The snapshots, pushed to whoever draws them. Not React state: a scan arrives far more often than the interface needs to repaint. */
export interface SnapshotFeed {
  latest(): PlantSnapshot | undefined;
  subscribe(listener: (snapshot: PlantSnapshot) => void): () => void;
  /** How many snapshots arrived so far; the frame-rate check reads the rate from it. */
  count(): number;
}

/** What the canvas reports about the view (VIS-006), and the limits it judges by: 3 s without a restored context, 5 s under 30 fps. */
export type CanvasFailure = { kind: 'unavailable'; reason: string } | { kind: 'lost' } | { kind: 'slow' };
export interface CanvasTiming {
  lostMs: number;
  slowMs: number;
  sampleMs: number;
}
export const LOST_MS = 3000;
export const SLOW_MS = 5000;
export const MIN_FPS = 30;
export const DEFAULT_TIMING: CanvasTiming = { lostMs: LOST_MS, slowMs: SLOW_MS, sampleMs: 1000 };

export interface PlantBinding {
  load: Load;
  /** Where the first line of text and the panel parts come from; refreshed at most every `UI_TICK_MS`. */
  feed: SnapshotFeed;
  /** The snapshot for the text and the panel parts, refreshed at most every `UI_TICK_MS`. */
  snapshot: PlantSnapshot | undefined;
  state: TransportState;
  /** The one message of PLT-016 in force; undefined at real time. */
  slowdownMessage: string | undefined;
  /** A session is registered as the command bar's transport. */
  bound: boolean;
  /** Takes a snapshot of the core now, after a person changed it while no scan ran. */
  publish(): void;
}

export const UI_TICK_MS = 100;

const fileText = (files: ReadonlyMap<string, { path: string; content: string }>, path: string): string | undefined =>
  [...files.values()].find((file) => file.path === path)?.content;
const NEVER = () => () => undefined;

export function usePlantSession(controller: DebugController | undefined, ref: SceneRef, deps: PlantPanelDeps): PlantBinding {
  const projectScene = useIDEStore((state) => fileText(state.loadedFiles, 'scene.json'));
  const projectMap = useIDEStore((state) => fileText(state.loadedFiles, 'plant-map.json'));
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const ioMap = useMemo(() => listIoMap(debugMap), [debugMap]);
  const adapter = controller?.adapter ?? null;

  const latest = useRef<PlantSnapshot | undefined>(undefined);
  const arrived = useRef(0);
  const listeners = useRef(new Set<(snapshot: PlantSnapshot) => void>());
  const feed = useMemo<SnapshotFeed>(
    () => ({
      latest: () => latest.current,
      subscribe: (listener) => {
        listeners.current.add(listener);
        return () => void listeners.current.delete(listener);
      },
      count: () => arrived.current,
    }),
    [],
  );
  const push = useCallback((next: PlantSnapshot) => {
    latest.current = next;
    arrived.current += 1;
    listeners.current.forEach((listener) => listener(next));
  }, []);

  // The core of the scene. A result belongs to the scene (and, for the project's, the files) it was built for;
  // for any other it reads as loading.
  const key = ref.kind === 'project' ? JSON.stringify(['project', projectScene, projectMap]) : `shipped:${ref.id}`;
  const [loaded, setLoaded] = useState<{ key: string; load: Load } | undefined>();
  const load: Load = loaded?.key === key ? loaded.load : { phase: 'loading' };
  const loadEngine = deps.loadEngine ?? loadPlantEngine;
  useEffect(() => {
    let cancelled = false;
    let created: PlantCore | undefined;
    void (async () => {
      const engine = await loadEngine();
      const texts =
        ref.kind === 'project'
          ? projectScene === undefined
            ? undefined
            : { scene: projectScene, map: projectMap ?? '' }
          : await engine.shippedScene(ref.id);
      if (!texts) throw new Error(ref.kind === 'project' ? 'scene.json' : ref.id);
      const parsed = parseScene(texts.scene);
      if ('problems' in parsed) throw new Error(parsed.problems.map((problem) => `${problem.path}: ${problem.message}`).join('; '));
      const core = await engine.createPlantCore(parsed.scene);
      if (cancelled) return core.dispose();
      created = core;
      latest.current = undefined;
      push(core.snapshot());
      setLoaded({ key, load: { phase: 'ready', engine, scene: parsed.scene, core, map: parseMap(texts.map) } });
    })().catch((error: unknown) => {
      if (!cancelled) setLoaded({ key, load: { phase: 'failed', detail: error instanceof Error ? error.message : String(error) } });
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
    // `key` stands for `ref` and the project's texts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadEngine, push]);

  // The session over the simulation the controller holds, bound as the command bar's transport while this panel shows its plant.
  const core = load.phase === 'ready' ? load.core : undefined;
  const map = load.phase === 'ready' ? load.map : undefined;
  const createSession = deps.createSession ?? createPlantSession;
  const session = useMemo(
    () => (core && map && isRuntimePort(adapter) ? createSession({ core, runtime: adapter, map, ioMap }) : undefined),
    [core, map, adapter, ioMap, createSession],
  );
  const transport = useMemo(() => (session ? plantTransport(session) : undefined), [session]);
  const [slow, setSlow] = useState<{ of: object; message: string | undefined } | undefined>();
  useEffect(() => {
    if (!session || !transport) return;
    const unregister = registerPlantTransport(transport);
    const off = session.onChange((event) => {
      if (event.kind === 'scan') push(event.snapshot);
      if (event.kind === 'slowdown') {
        setSlow({ of: session, message: event.factor < 1 ? event.message : undefined });
        announce(event.message);
      }
    });
    return () => {
      off();
      unregister();
      if (session.state !== 'idle' && session.state !== 'stopped') void session.stop().catch(() => undefined);
    };
  }, [session, transport, push]);
  const state = useSyncExternalStore(
    useCallback((notify: () => void) => (transport ? transport.onChange(notify) : NEVER()), [transport]),
    () => transport?.state ?? 'stopped',
  );
  const snapshot = useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, UI_TICK_MS);
      return () => clearInterval(timer);
    },
    () => latest.current,
  );

  const publish = useCallback(() => {
    if (core) push(core.snapshot());
  }, [core, push]);
  const slowdownMessage = state === 'stopped' || slow?.of !== session ? undefined : slow?.message;
  return { load, feed, snapshot, state, slowdownMessage, bound: session !== undefined, publish };
}
