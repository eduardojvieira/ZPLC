/**
 * The question behind every destructive or physical action that a handler starts (UX-020): `await confirmAction(...)`
 * opens one alert dialog (`ActionConfirmHost`, mounted once in the workbench) and answers true only when the person
 * chooses the action. Without a host mounted, or while another question is open, the answer is no: an action never runs
 * because nobody was asked.
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import type { DialogSize } from '../ui';

export interface ActionConfirmRequest {
  title: string;
  description: string;
  /** The name of the action ("Stop PLC", "Force variable"). Null when the dialog only informs and offers Close. */
  actionLabel: string | null;
  cancelLabel: string;
  destructive?: boolean;
  size?: DialogSize;
  /** What the person needs to see to decide, below the description. */
  body?: ReactNode;
}

interface Pending {
  request: ActionConfirmRequest;
  settle: (answer: boolean) => void;
}

let pending: Pending | null = null;
let hosts = 0;
const listeners = new Set<() => void>();
const emit = (): void => listeners.forEach((listener) => listener());

export function currentConfirmation(): ActionConfirmRequest | null {
  return pending?.request ?? null;
}

export function confirmAction(request: ActionConfirmRequest): Promise<boolean> {
  if (hosts === 0 || pending !== null) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    pending = { request, settle: resolve };
    emit();
  });
}

export function answerConfirmation(answer: boolean): void {
  const open = pending;
  if (!open) return;
  pending = null;
  open.settle(answer);
  emit();
}

/** Called by the host while it is on the page; the last host to go takes an open question with it, as a no. */
export function mountConfirmHost(): () => void {
  hosts += 1;
  return () => {
    hosts -= 1;
    if (hosts === 0) answerConfirmation(false);
  };
}

export function useConfirmation(): ActionConfirmRequest | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    currentConfirmation,
    () => null,
  );
}
