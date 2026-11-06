/**
 * The session of one try-it lab on a reading page (LRN-041): it drives the lab that `runtime/tryLab.ts` opens, polls its
 * readings every 100 ms while the learner has run it, and passes the inputs on. The lab does nothing until the learner
 * presses Run (LRN-015). On unmount it closes the lab and clears its timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { truthy, type ElementState, type Reading } from '../../monitoring/elementStates';
import { openTryLab, type TryLab, type TryLabOpening } from '../../runtime/tryLab';
import type { LdTryData } from '../readingTypes';
import { stepTrace, traceTiming, type Trace } from './ldTryModel';

export const POLL_MS = 100;

export type LabStatus = 'idle' | 'running' | 'paused' | 'failed';

export interface LabFailure {
  reason: 'compile' | 'input' | 'output' | 'runtime' | 'missing';
  detail: string;
}

export interface LdTryLab {
  status: LabStatus;
  failure: LabFailure | undefined;
  /** The state of each element of the rungs, for the diagram. */
  states: ReadonlyMap<string, ElementState>;
  /** The last value of each polled variable. */
  read: (variable: string) => Reading;
  /** The input values as the learner set them. */
  inputs: Readonly<Record<string, boolean>>;
  timing: ReturnType<typeof traceTiming> | undefined;
  run: () => void;
  pause: () => void;
  reset: () => void;
  setInput: (name: string, value: boolean) => void;
}

const EMPTY_STATES: ReadonlyMap<string, ElementState> = new Map();
const NO_READING: LdTryLab['read'] = () => undefined;
const EMPTY_TRACE: Trace = { at: 0, last: {}, edges: {} };

/** `open` is for a test that gives another lab; a page opens the lab of the WebAssembly runtime. */
export function useLdTry(content: string | undefined, block: LdTryData, open: typeof openTryLab = openTryLab): LdTryLab {
  // the page parses its text again on a render: the block is told apart by what it says, not by its identity
  const blockKey = JSON.stringify(block);
  const data = useMemo(() => JSON.parse(blockKey) as LdTryData, [blockKey]);
  // The lab is opened and closed by one effect, so that StrictMode's unmount-and-remount opens a fresh one instead of reusing a closed one.
  const [pending, setPending] = useState<TryLabOpening | undefined>();
  const opened = content === undefined ? undefined : pending;
  useEffect(() => {
    if (content === undefined) return undefined;
    const made = open(content, data);
    // the lab is an external resource this effect opens, so the opening can only be stored after it
    setPending(made); // eslint-disable-line react-hooks/set-state-in-effect
    return () => {
      setPending(undefined);
      if (made.ok) void made.lab.close();
    };
  }, [content, data, open]);
  const lab: TryLab | undefined = opened?.ok ? opened.lab : undefined;
  const [status, setStatus] = useState<LabStatus>('idle');
  const [started, setStarted] = useState(false);
  const [runtimeFailure, setRuntimeFailure] = useState<LabFailure | undefined>();
  const [states, setStates] = useState(EMPTY_STATES);
  const [read, setRead] = useState<LdTryLab['read']>(() => NO_READING);
  const [inputs, setInputs] = useState<Record<string, boolean>>({});
  const [trace, setTrace] = useState<Trace>(EMPTY_TRACE);
  const clock = useRef({ running: false, last: 0, elapsed: 0 });
  const traceRef = useRef(EMPTY_TRACE);

  // a lab whose program changes starts over: derived during render, as React asks, not set in an effect
  const [seen, setSeen] = useState(lab);
  if (seen !== lab) {
    setSeen(lab);
    setStatus('idle');
    setStarted(false);
    setRuntimeFailure(undefined);
    setStates(EMPTY_STATES);
    setRead(() => NO_READING);
    setInputs({});
    setTrace(EMPTY_TRACE);
  }

  const fail = useCallback((error: unknown): void => {
    setStatus('failed');
    setRuntimeFailure({ reason: 'runtime', detail: error instanceof Error ? error.message : String(error) });
  }, []);

  useEffect(() => {
    traceRef.current = EMPTY_TRACE;
    clock.current = { running: false, last: 0, elapsed: 0 };
  }, [lab]);

  // the poll: only after the learner ran the lab, until it fails or the page closes
  useEffect(() => {
    if (!lab || !started || status === 'failed') return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const readings = await lab.readings();
        if (!alive) return;
        const now = performance.now();
        if (clock.current.running) clock.current.elapsed += now - clock.current.last;
        clock.current.last = now;
        setRead(() => readings.read);
        setStates(readings.states);
        if (clock.current.running) {
          const values: Record<string, boolean | undefined> = {};
          for (const name of data.timing ?? []) values[name] = truthy(readings.read(name));
          traceRef.current = stepTrace(traceRef.current, Math.round(clock.current.elapsed), values);
          setTrace(traceRef.current);
        }
      } catch (error) {
        if (alive) fail(error);
        return;
      }
      if (alive) timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [lab, started, status === 'failed', data.timing, fail]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(() => {
    if (!lab) return;
    lab.run().then(() => {
      clock.current = { ...clock.current, running: true, last: performance.now() };
      setStarted(true);
      setStatus('running');
    }, fail);
  }, [lab, fail]);

  const pause = useCallback(() => {
    if (!lab) return;
    lab.hold().then(() => {
      clock.current.running = false;
      setStatus('paused');
    }, fail);
  }, [lab, fail]);

  const reset = useCallback(() => {
    if (!lab) return;
    lab.restart().then(() => {
      clock.current = { running: false, last: 0, elapsed: 0 };
      traceRef.current = EMPTY_TRACE;
      setTrace(EMPTY_TRACE);
      setInputs({});
      setStatus('idle');
    }, fail);
  }, [lab, fail]);

  const setInput = useCallback(
    (name: string, value: boolean) => {
      if (!lab) return;
      setInputs((now) => ({ ...now, [name]: value }));
      lab.press(name, value).catch(fail);
    },
    [lab, fail],
  );

  const failure: LabFailure | undefined =
    content === undefined
      ? { reason: 'missing', detail: data.src }
      : opened === undefined
        ? undefined
        : !opened.ok
          ? opened.reason === 'compile'
            ? { reason: 'compile', detail: opened.message }
            : { reason: opened.reason, detail: opened.name }
          : runtimeFailure;
  const timing = useMemo(
    () => (data.timing && data.timing.length > 0 ? traceTiming(trace, [...data.timing]) : undefined),
    [trace, data.timing],
  );

  return { status: failure ? 'failed' : status, failure, states, read, inputs, timing, run, pause, reset, setInput };
}
