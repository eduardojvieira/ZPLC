/**
 * Plant I/O mode as the shell sees it (PLS-008, LNK-007, LNK-008, LNK-010, LNK-014). The M6 link is bound here behind a narrow
 * interface; nothing in this file starts it by itself: only `startIoMode`, called after a person confirmed the dialog, does.
 * The shape is the one plan-u3.md P8 states, plus `subscribe` so the rail repaints; if M6's contract differs, M6 wins and the
 * adapter that binds it absorbs the difference.
 */
import { useSyncExternalStore } from 'react';

export type IoModeState = 'off' | 'starting' | 'running' | 'failed';

export interface IoModeLink {
  readonly state: IoModeState;
  readonly mirroring: boolean;
  readonly latencyMs: { last: number; worst: number } | null;
  start(): Promise<void>;
  stop(): Promise<void>;
  setMirroring(on: boolean): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface IoModeStatus {
  state: IoModeState;
  mirroring: boolean;
  latencyMs: { last: number; worst: number } | null;
  /** Why the last start failed, as text (the located message of PLS-008). */
  failure: string | null;
  /** The confirmation dialog is open. */
  confirming: boolean;
}

const OFF: IoModeStatus = { state: 'off', mirroring: false, latencyMs: null, failure: null, confirming: false };

let link: IoModeLink | null = null;
let failure: string | null = null;
let confirming = false;
let snapshot: IoModeStatus = OFF;
const listeners = new Set<() => void>();

function refresh(): void {
  snapshot = link
    ? { state: link.state, mirroring: link.mirroring, latencyMs: link.latencyMs, failure, confirming }
    : { ...OFF, failure, confirming };
  listeners.forEach((listener) => listener());
}

/** Binds the link of the connected board (or none). Returns the function that unbinds exactly this one. */
export function bindIoModeLink(next: IoModeLink | null): () => void {
  link = next;
  failure = null;
  const off = next?.subscribe(refresh);
  refresh();
  return () => {
    off?.();
    if (link === next) {
      link = null;
      confirming = false;
      refresh();
    }
  };
}

export const getIoModeStatus = (): IoModeStatus => snapshot;

export function useIoModeStatus(): IoModeStatus {
  return useSyncExternalStore(
    (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    getIoModeStatus,
    getIoModeStatus,
  );
}

/** Opens or closes the confirmation (LNK-008). It starts nothing. */
export function requestFeedBoard(open: boolean): void {
  confirming = open;
  refresh();
}

/** Called only after a person confirmed. A failure is kept as text and the state stays out of the rail's third state. */
export async function startIoMode(): Promise<void> {
  confirming = false;
  failure = null;
  try {
    await link?.start();
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  refresh();
}

export async function stopIoMode(): Promise<void> {
  await link?.stop();
  refresh();
}

export async function setIoModeMirroring(on: boolean): Promise<void> {
  await link?.setMirroring(on);
  refresh();
}

/** A link that touches nothing, for tests and journeys against a fake session (RULE 8): it records the calls it got. */
export function createFakeIoModeLink(options: { failStart?: string } = {}) {
  const heard = new Set<() => void>();
  const calls: string[] = [];
  const fake = {
    state: 'off' as IoModeState,
    mirroring: false,
    latencyMs: null as { last: number; worst: number } | null,
    calls,
    emit: () => heard.forEach((listener) => listener()),
    measure(latency: { last: number; worst: number }) {
      fake.latencyMs = latency;
      fake.emit();
    },
    async start() {
      calls.push('start');
      fake.state = 'starting';
      fake.emit();
      if (options.failStart) {
        fake.state = 'failed';
        fake.emit();
        throw new Error(options.failStart);
      }
      fake.state = 'running';
      fake.emit();
    },
    async stop() {
      calls.push('stop');
      fake.state = 'off';
      fake.mirroring = false;
      fake.emit();
    },
    async setMirroring(on: boolean) {
      calls.push(`mirror:${on}`);
      fake.mirroring = on;
      fake.emit();
    },
    subscribe(listener: () => void) {
      heard.add(listener);
      return () => void heard.delete(listener);
    },
  };
  return fake satisfies IoModeLink & { calls: string[] };
}
