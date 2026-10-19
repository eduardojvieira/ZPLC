/**
 * The live I/O faceplate of the running program (LRN-017, IDE-024). The rows come from the debug map of the program that
 * is loaded, not from a list of names. A value is written with the typed write of `useDeclaredInputs` (`setDeclaredInput`)
 * and the runtime applies it at the start of the next scan; the value read back says when that happened, so a change is
 * pending until the runtime holds it and applied after. A force goes through the same force operation as the Watch table,
 * so "set" and "forced" mean here what they mean there.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DebugController } from '../hooks/useDebugController';
import { useDeclaredInputs } from '../hooks/useDeclaredInputs';
import { useT } from '../i18n';
import { inputWrite, type DeclaredInput } from '../runtime/declaredInputs';
import type { WatchVariable } from '../runtime/debugAdapter';
import { latestWins, settleInputs } from '../runtime/faceplateState';
import { listIoMap } from '../runtime/ioMap';
import { useIDEStore } from '../store/useIDEStore';
import { announce } from '../utils/announce';
import { Faceplate, type FaceplateInputRow, type FaceplateOutputRow, type InputPhase } from './Faceplate';

/** The types a force carries: the Watch table's own (up to 32 bits). */
const FORCE_TYPES = new Set<string>(['BOOL', 'BYTE', 'INT', 'WORD', 'DINT', 'DWORD', 'REAL', 'TIME']);
const REFRESH_MS = 200;
/** How long "applied" stays beside an input before the row goes quiet again. */
const APPLIED_MS = 1500;

export function FaceplatePanel({ controller }: { controller: DebugController | undefined }) {
  const { t } = useT();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const forcedValues = useIDEStore((state) => state.debug.forcedValues);
  const ioMap = useMemo(() => listIoMap(debugMap), [debugMap]);
  const adapter = controller?.adapter ?? null;
  const connected = Boolean(adapter?.connected);
  const simulated = adapter !== null && adapter.type !== 'serial';
  const vmState = controller?.vmState ?? 'disconnected';
  const supported = controller?.debugCapabilities?.features['simulation-inputs']?.status === 'supported';
  const { setDeclaredInput, readDeclaredInputs } = useDeclaredInputs(adapter);
  const [values, setValues] = useState<ReadonlyMap<string, boolean | number>>(new Map());
  const [phases, setPhases] = useState<ReadonlyMap<string, InputPhase>>(new Map());
  const [message, setMessage] = useState<string | undefined>();
  const pending = useRef(new Map<string, boolean | number>());
  const senders = useRef(new Map<string, (value: boolean | number) => Promise<void>>());
  const types = useMemo(() => new Map(ioMap.inputs.map((input) => [input.path, input.type])), [ioMap]);

  const setPhase = useCallback((path: string, phase: InputPhase) => {
    setPhases((current) => { const next = new Map(current); if (phase === 'idle') next.delete(path); else next.set(path, phase); return next; });
  }, []);

  useEffect(() => {
    if (!connected || !simulated || (ioMap.inputs.length === 0 && ioMap.outputs.length === 0)) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const read = await readDeclaredInputs([...ioMap.inputs, ...ioMap.outputs]);
        if (!cancelled) {
          setValues(read);
          const settled = settleInputs(pending.current, read, types);
          pending.current = settled.pending;
          for (const path of settled.applied) {
            setPhase(path, 'applied');
            const name = ioMap.inputs.find((input) => input.path === path)?.name ?? path;
            const held = read.get(path);
            announce(t('faceplate.announceApplied', { name, value: typeof held === 'boolean' ? (held ? 'TRUE' : 'FALSE') : String(held) }));
            setTimeout(() => { if (!pending.current.has(path)) setPhase(path, 'idle'); }, APPLIED_MS);
          }
        }
      } catch { /* the next refresh asks again; a lost connection ends this effect */ }
      if (!cancelled) timer = setTimeout(() => { void refresh(); }, REFRESH_MS);
    };
    void refresh();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      // A program that is replaced or a simulation that ends leaves nothing pending.
      pending.current = new Map();
      setPhases(new Map());
    };
  }, [connected, simulated, readDeclaredInputs, ioMap, types, setPhase, t]);

  const unavailable = !debugMap ? t('faceplate.noMap')
    : !connected ? t('faceplate.notConnected')
      : !simulated ? t('faceplate.hardware')
        : vmState === 'error' ? t('faceplate.faulted')
          : vmState !== 'running' && vmState !== 'paused' ? t('faceplate.notRunning')
            : !supported ? t('faceplate.noCapability')
              : undefined;
  const note = vmState === 'paused' ? t('faceplate.pausedNote') : undefined;

  const inputRows: FaceplateInputRow[] = ioMap.inputs.map((input) => ({
    input,
    value: connected && simulated ? values.get(input.path) ?? null : null,
    phase: phases.get(input.path) ?? 'idle',
    forced: forcedValues.get(input.path)?.state === 'forced',
    forceable: FORCE_TYPES.has(input.type),
  }));
  const outputRows: FaceplateOutputRow[] = ioMap.outputs.map((output) => ({
    output,
    value: connected && simulated ? values.get(output.path) ?? null : null,
    forced: forcedValues.get(output.path)?.state === 'forced',
  }));

  /** Forces the input at `value`: the whole byte, as it is now with this bit changed, for a bit that shares its byte. */
  const forceAt = async (input: DeclaredInput, value: boolean | number) => {
    if (!controller || !adapter) return;
    const current = input.bitOffset !== undefined ? (await adapter.peek(input.address, 1))[0] : undefined;
    const write = inputWrite(input, value, current);
    if (input.bitOffset !== undefined) await controller.toggleForceValue(input.path, input.address, write.bytes[0]!, 'BYTE', true);
    else await controller.toggleForceValue(input.path, input.address, value, input.type as WatchVariable['type'], true);
  };

  const run = async (action: () => Promise<void>) => {
    setMessage(undefined);
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : t('faceplate.failed')); }
  };

  /** One change at a time per input, and of those that arrive meanwhile only the last (a slider dragged across its range). */
  const sendFor = (input: DeclaredInput) => {
    let send = senders.current.get(input.path);
    if (!send) {
      send = latestWins(async (value) => { await setDeclaredInput(input, value); });
      senders.current.set(input.path, send);
    }
    return send;
  };

  const set = (input: DeclaredInput, value: boolean | number) => {
    void run(async () => {
      if (!controller) return;
      if (forcedValues.get(input.path)?.state === 'forced') { await forceAt(input, value); return; }
      pending.current.set(input.path, value);
      setPhase(input.path, 'pending');
      try { await sendFor(input)(value); } catch (error) { pending.current.delete(input.path); setPhase(input.path, 'idle'); throw error; }
    });
  };

  return (
    <Faceplate
      inputs={inputRows}
      outputs={outputRows}
      unavailable={unavailable}
      note={note}
      message={message}
      onSet={set}
      onHold={(input, down) => set(input, down)}
      onForce={(input, force) => { void run(async () => {
        if (!controller) return;
        const present = values.get(input.path);
        if (!force) await controller.toggleForceValue(input.path, input.address, null, input.bitOffset !== undefined ? 'BYTE' : input.type as WatchVariable['type'], false);
        else if (present !== undefined) await forceAt(input, present);
      }); }}
    />
  );
}
