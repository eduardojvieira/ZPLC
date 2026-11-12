/**
 * Notifications (IDE-021): the result of a build, a save, a deploy and a connection change, and the progress of a long
 * operation with its cancel action. Each notification names the panel that holds its details, so a result is one click
 * from its evidence (the Output, Problems or Tests tab). The Output panel keeps its messages: this is the summary, not a
 * replacement.
 *
 * The model is pure (`beginNotification`, `finishNotification`, `dismissNotification`, `expireNotifications` take a
 * list and return one) and the store is a thin holder of it, so the policy is tested without a window.
 *
 *   - a running operation stays until it ends, and shows progress and, when it can be stopped, a cancel action;
 *   - a success goes by itself after `SUCCESS_VISIBLE_MS`; a failure, a warning and a cancellation stay until dismissed;
 *   - a finished result replaces the earlier finished result of its kind, so repeated saves do not pile up; a success also
 *     replaces any success that is showing (one notice per composite action, FLW-013), and never a failure;
 *   - the list is bounded, oldest finished result first.
 */
import { create } from 'zustand';

import type { ConsoleTab } from '../types';
import { announce } from '../utils/announce';

export type NotificationKind = 'build' | 'save' | 'deploy' | 'connection' | 'tests' | 'run';
export type NotificationStatus = 'running' | 'success' | 'warning' | 'error' | 'cancelled';

/** The way back from a failure: what the button says, and what it does. */
export interface NotificationRecovery {
  label: string;
  run: () => void;
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  status: NotificationStatus;
  title: string;
  detail?: string;
  /** The panel that holds the details of this operation or result. */
  details: ConsoleTab;
  /** Present while a long operation runs and can be stopped. */
  cancel?: () => void;
  /** Present on a failure or a warning that the person can recover from in one step (UX-021). */
  recover?: NotificationRecovery;
  startedAt: number;
  finishedAt?: number;
}

export interface NotificationStart {
  kind: NotificationKind;
  title: string;
  detail?: string;
  details: ConsoleTab;
  cancel?: () => void;
}

export interface NotificationResult {
  kind: NotificationKind;
  status: Exclude<NotificationStatus, 'running'>;
  title: string;
  detail?: string;
  details: ConsoleTab;
  recover?: NotificationRecovery;
}

export const NOTIFICATION_LIMIT = 8;
/** How long a success stays on screen. */
export const SUCCESS_VISIBLE_MS = 6_000;

const isFinished = (entry: AppNotification) => entry.status !== 'running';

/** Bounded: past the limit, the oldest finished results go first (a running operation is never dropped). */
function bounded(list: AppNotification[]): AppNotification[] {
  let overflow = list.length - NOTIFICATION_LIMIT;
  if (overflow <= 0) return list;
  return list.filter((entry) => {
    if (overflow > 0 && isFinished(entry)) {
      overflow -= 1;
      return false;
    }
    return true;
  });
}

export function beginNotification(list: AppNotification[], start: NotificationStart, id: string, now: number): AppNotification[] {
  const entry: AppNotification = {
    id,
    kind: start.kind,
    status: 'running',
    title: start.title,
    details: start.details,
    startedAt: now,
    ...(start.detail ? { detail: start.detail } : {}),
    ...(start.cancel ? { cancel: start.cancel } : {}),
  };
  return bounded([...list, entry]);
}

/** Ends an operation in place; an operation that was dismissed meanwhile still reports its result. */
export function finishNotification(list: AppNotification[], id: string, result: NotificationResult, now: number): AppNotification[] {
  const existing = list.find((entry) => entry.id === id);
  const finished: AppNotification = {
    id,
    kind: result.kind,
    status: result.status,
    title: result.title,
    details: result.details,
    startedAt: existing?.startedAt ?? now,
    finishedAt: now,
    ...(result.detail ? { detail: result.detail } : {}),
    ...(result.recover && (result.status === 'error' || result.status === 'warning') ? { recover: result.recover } : {}),
  };
  // The latest finished result of a kind replaces the earlier one, except that a success never replaces a failure; and a
  // success replaces the success that is showing, whatever its kind.
  const replaced = (entry: AppNotification) =>
    isFinished(entry) && (result.status === 'success' ? entry.status === 'success' : entry.kind === result.kind);
  const kept = list.filter((entry) => entry.id !== id && !replaced(entry));
  const position = existing ? list.findIndex((entry) => entry.id === id) : -1;
  if (position < 0) return bounded([...kept, finished]);
  // Keep the place of the operation among the running ones.
  const before = list.slice(0, position).filter((entry) => kept.includes(entry));
  const after = list.slice(position + 1).filter((entry) => kept.includes(entry));
  return bounded([...before, finished, ...after]);
}

/** Names the step a running operation is at; the id and the cancel action stay. The same list when it is not running. */
export function advanceNotification(list: AppNotification[], id: string, stepTitle: string): AppNotification[] {
  const entry = list.find((candidate) => candidate.id === id);
  if (!entry || entry.status !== 'running' || entry.title === stepTitle) return list;
  return list.map((candidate) => (candidate === entry ? { ...entry, title: stepTitle } : candidate));
}

export function dismissNotification(list: AppNotification[], id: string): AppNotification[] {
  return list.some((entry) => entry.id === id) ? list.filter((entry) => entry.id !== id) : list;
}

/** Removes the successes older than `SUCCESS_VISIBLE_MS`; the same list when none is due. */
export function expireNotifications(list: AppNotification[], now: number): AppNotification[] {
  const due = (entry: AppNotification) => entry.status === 'success' && now - (entry.finishedAt ?? now) > SUCCESS_VISIBLE_MS;
  return list.some(due) ? list.filter((entry) => !due(entry)) : list;
}

interface NotificationState {
  items: AppNotification[];
  /** Starts a long operation and returns the id that ends it. */
  begin(start: NotificationStart): string;
  /** Changes the step a running notice names (FLW-001); announced once per change. */
  advance(id: string, stepTitle: string): void;
  finish(id: string, result: NotificationResult): void;
  /** A result that had no running phase (a save, a refused deploy). */
  report(result: NotificationResult): void;
  dismiss(id: string): void;
  expire(): void;
  clear(): void;
}

/**
 * What a screen reader hears of a notification (UX-026): the title and detail, through the shared announcer. The list on
 * screen has no live region of its own, because a region inserted together with its text is not reliably read; an error
 * is a fault and is read at once.
 */
function say(entry: { status: NotificationStatus; title: string; detail?: string | undefined }): void {
  announce([entry.title, entry.detail].filter(Boolean).join('. '), entry.status === 'error' ? 'assertive' : 'polite');
}

export const useNotifications = create<NotificationState>((set) => ({
  items: [],
  begin: (start) => {
    const id = crypto.randomUUID();
    say({ status: 'running', title: start.title });
    set((state) => ({ items: beginNotification(state.items, start, id, Date.now()) }));
    return id;
  },
  advance: (id, stepTitle) => {
    const before = useNotifications.getState().items;
    const items = advanceNotification(before, id, stepTitle);
    if (items === before) return;
    say({ status: 'running', title: stepTitle });
    set({ items });
  },
  finish: (id, result) => {
    say(result);
    set((state) => ({ items: finishNotification(state.items, id, result, Date.now()) }));
  },
  report: (result) => {
    say(result);
    set((state) => ({ items: finishNotification(state.items, crypto.randomUUID(), result, Date.now()) }));
  },
  dismiss: (id) => set((state) => ({ items: dismissNotification(state.items, id) })),
  expire: () =>
    set((state) => {
      const items = expireNotifications(state.items, Date.now());
      return items === state.items ? state : { items };
    }),
  clear: () => set({ items: [] }),
}));
