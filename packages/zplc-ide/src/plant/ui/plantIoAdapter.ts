/**
 * Plant I/O mode, the M6 link behind the shell's `IoModeLink` (PLS-008, LNK-007, LNK-008, LNK-010, LNK-014).
 *
 * The adapter builds no controller until a person confirmed the dialog (`start`): the ports of the real board are read at that
 * moment and never earlier. It stops the controller when the dialog's Stop is pressed, when the board disconnects, when the
 * project or the plant changes and when the window closes (`dispose`). Nothing here opens a port by itself (rule 8).
 *
 * Mapping of the controller's phase: `entering` is `starting`; `active` and `leaving` are `running`; `idle` and a `left` with
 * the reason CLOSED are `off`; `unsupported` and any other `left` are `failed`, with the located reason as `failure`.
 */
import { useEffect, useReducer } from 'react';
import { currentLocale, t } from '../../i18n';
import { publishCommandState, useCommandState } from '../../commands/bus';
import type { PlantMapV2 } from '../../plants/plantMap';
import { connectionManager } from '../../runtime/connectionManager';
import type { FirmwareProtocol } from '../../runtime/link/firmwareProtocol';
import type { IoMap } from '../../runtime/ioMap';
import { LinkError } from '../../runtime/link/deviceLink';
import { plantIoSupport } from '../board/support';
import { bindIoModeLink, type IoModeLink, type IoModeState } from '../../store/ioModeStatus';
import { useIDEStore } from '../../store/useIDEStore';
import { createPlantIoController, type PlantIoController, type PlantIoPorts } from '../board/boardPlantLink';
import type { PlantBoardPort } from '../board/portTypes';
import type { PlantCore } from '../contracts';

/** What Studio asks for (plan-m6.md question 3, the rehearsal of the docs): a frame every 20 ms, a 10 ms scan, a 500 ms timeout. */
export const PLANT_IO_DEFAULTS = { scanMs: 10, frameMs: 20, timeoutMs: 500 } as const;

export interface PlantIoAdapter extends IoModeLink {
  /** Stops the mode if it runs and releases the controller. Safe when off, and safe to call more than once. */
  dispose(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The reason a start failed, said through the catalog in the active language (the controller's own texts are English). */
function located(error: unknown): string {
  if (error instanceof LinkError) return t('plant.ioMode.refused', { code: error.errorName });
  const text = messageOf(error);
  if (text.startsWith('plant: no signal')) return t('plant.ioMode.noSignal');
  if (text.startsWith('plant: the board granted')) return t('plant.ioMode.grantMismatch');
  return text;
}

/** `ports` is called only by `start`, so no controller exists before a person confirmed. */
export function createPlantIoAdapter(
  ports: () => PlantIoPorts,
  create: typeof createPlantIoController = createPlantIoController,
): PlantIoAdapter {
  const listeners = new Set<() => void>();
  let controller: PlantIoController | null = null;
  let unlisten: (() => void) | null = null;
  let failure: string | null = null;
  let disposed = false;
  /** A person pressed Stop while the entry was pending: the board exits as soon as the entry is answered. */
  let stopAsked = false;
  const emit = () => listeners.forEach((listener) => listener());

  const release = () => {
    unlisten?.();
    unlisten = null;
    controller = null;
  };
  /** What the controller says, as the located reason the shell shows. */
  const sync = () => {
    const snap = controller?.snapshot();
    if (snap?.phase === 'unsupported') {
      const reason = snap.unsupported ?? { en: '', es: '' };
      failure = currentLocale() === 'es' ? reason.es : reason.en;
    } else if (snap?.phase === 'left' && snap.reason !== 'CLOSED')
      failure = t(`plantIo.exit.${snap.reason ?? 'FAULT'}` as 'plantIo.exit.FAULT');
    emit();
  };
  const stopQuietly = async (target: PlantIoController | null = controller) => {
    try {
      await target?.stop();
    } catch (error) {
      failure = messageOf(error);
    }
  };

  const adapter: PlantIoAdapter = {
    get state(): IoModeState {
      const phase = controller?.snapshot().phase;
      if (phase === 'entering') return 'starting';
      if (phase === 'active' || phase === 'leaving') return 'running';
      return failure !== null ? 'failed' : 'off';
    },
    get mirroring() {
      return controller?.snapshot().mirror ?? false;
    },
    get latencyMs() {
      const snap = controller?.snapshot();
      return snap && snap.frames > 0 ? { last: snap.rttMs.last, worst: snap.rttMs.max } : null;
    },
    get failure() {
      return failure;
    },
    async start() {
      if (disposed) return;
      release();
      failure = null;
      stopAsked = false;
      try {
        controller = create(ports());
      } catch (error) {
        failure = located(error);
        emit();
        throw new Error(failure);
      }
      const started = controller;
      unlisten = started.subscribe(sync);
      try {
        await started.start();
      } catch (error) {
        failure = located(error);
        release();
        emit();
        throw new Error(failure);
      }
      sync();
      if (failure !== null) {
        // an unsupported firmware: the entry was never sent
        release();
        emit();
        throw new Error(failure);
      }
      // a person pressed Stop, or the window closed or the board went away, while the entry was pending: leave now, through
      // this start's own controller (a dispose already dropped the shared reference)
      if (disposed || stopAsked) await stopQuietly(started);
      emit();
    },
    async stop() {
      if (controller?.snapshot().phase === 'entering') stopAsked = true;
      else await stopQuietly();
      emit();
    },
    async setMirroring(on) {
      await controller?.setMirror(on);
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async dispose() {
      disposed = true;
      await stopQuietly();
      release();
      emit();
    },
  };
  return adapter;
}

export interface BoardPlantIoDeps {
  /** The plant link port of the connected board, or none; read when a person confirms and when the offer is decided. */
  port(): PlantBoardPort | null;
  firmware(): FirmwareProtocol | null;
  /** Calls the listener when the link information changes; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  create?: typeof createPlantIoController;
}

const connected: BoardPlantIoDeps = {
  port: () => connectionManager.plantBoardPort(),
  firmware: () => connectionManager.linkInfo.firmware?.protocol ?? null,
  subscribe: (listener) => connectionManager.onLinkInfoUpdate(listener),
};

export interface BoardPlantIoInput {
  /** The plant core and the plant map the session built, when a plant is loaded. */
  core?: PlantCore | undefined;
  map?: PlantMapV2 | undefined;
  ioMap: IoMap;
  /** No simulation session drives the core. */
  idle: boolean;
  /** The plant's tab is the one on screen. */
  visible: boolean;
  shortestPulseMs?: number | undefined;
}

/**
 * Binds the adapter of the connected board to the shell while the offer exists, and says whether the action is offered. The mode
 * ends with the board's connection, the project, the plant and the window.
 */
export function useBoardPlantIo(input: BoardPlantIoInput, deps: BoardPlantIoDeps = connected): { available: boolean; blocked?: string } {
  const { mode, connected: isConnected } = useCommandState();
  const handle = useIDEStore((state) => state.directoryHandle);
  const [, repaint] = useReducer((count: number) => count + 1, 0);
  useEffect(() => deps.subscribe(repaint), [deps]);
  const { core, map, ioMap, shortestPulseMs } = input;
  const supported = deps.port()?.supported() ?? false;
  const loaded = mode === 'hardware' && isConnected && core !== undefined && map !== undefined;
  const ready = loaded && supported;
  const empty = ioMap.inputs.length + ioMap.outputs.length === 0;
  const available = ready && !empty && input.idle && input.visible;
  /** Why the action is shown but disabled (LNK-012: the person is told). */
  let blocked: string | undefined;
  if (loaded && input.idle && input.visible) {
    if (!supported) {
      const support = plantIoSupport(deps.firmware());
      const reason = support.supported ? '' : currentLocale() === 'es' ? support.reason.es : support.reason.en;
      blocked = t('plant.ioMode.unsupported', { reason });
    } else if (empty) blocked = t('plant.ioMode.noProgram');
  }

  useEffect(() => {
    publishCommandState({ plantFeedable: available });
    return () => publishCommandState({ plantFeedable: false });
  }, [available]);

  useEffect(() => {
    if (!ready || !core || !map) return;
    const adapter = createPlantIoAdapter(() => {
      const link = deps.port();
      if (!link) throw new Error(t('plant.ioMode.noPort'));
      return {
        link,
        core,
        map,
        ioMap,
        ...PLANT_IO_DEFAULTS,
        ...(shortestPulseMs === undefined ? {} : { shortestPulseMs }),
        firmware: deps.firmware,
      };
    }, deps.create);
    const unbind = bindIoModeLink(adapter);
    const close = () => void adapter.dispose();
    window.addEventListener('beforeunload', close);
    return () => {
      window.removeEventListener('beforeunload', close);
      unbind();
      close();
    };
  }, [ready, core, map, ioMap, shortestPulseMs, handle, deps]);

  return blocked === undefined ? { available } : { available, blocked };
}
