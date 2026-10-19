/**
 * The live plant of the Lab tab (LRN-018, LRN-037): picks the mapping of a lesson that fits the loaded program, runs the plant
 * in closed loop with the simulation (`plantLoop.ts`), and offers play, pause, step, reset and the fault actions of the plant
 * as keyboard-operable buttons. A change of situation is announced with `announce()` in the words of the text equivalent.
 */
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Select } from '../ui';
import type { DebugController } from '../hooks/useDebugController';
import { useDeclaredInputs } from '../hooks/useDeclaredInputs';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { useT } from '../i18n';
import { faceplateUnavailable } from '../runtime/faceplateState';
import { listIoMap } from '../runtime/ioMap';
import { useIDEStore } from '../store/useIDEStore';
import { announce } from '../utils/announce';
import { createPlantRun, type PlantKind } from './plantEngine';
import { plantFacts } from './plantFacts';
import { createPlantLoop } from './plantLoop';
import { resolvePlantMap, type PlantMap } from './plantMap';
import { PlantView } from './PlantView';

const POLL_MS = 100;

interface Candidate { lessonId: string; title: string; map: PlantMap }

export function PlantLivePanel({ controller }: { controller: DebugController | undefined }) {
  const { t, locale } = useT();
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const ioMap = useMemo(() => listIoMap(debugMap), [debugMap]);
  const adapter = controller?.adapter ?? null;
  const connected = Boolean(adapter?.connected);
  const simulated = adapter !== null && adapter.type !== 'serial';
  const { setDeclaredInput, readDeclaredInputs } = useDeclaredInputs(adapter);
  const [chosen, setChosen] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const [, setVersion] = useState(0);

  // Every lesson mapping that binds to every I/O point of the loaded program is a candidate; none is picked by a name.
  const candidates = useMemo<Candidate[]>(() => LESSON_INDEX.lessons.flatMap((lesson) => {
    const map = lesson.plantMap;
    if (!map || resolvePlantMap(map, ioMap).problems.length > 0) return [];
    return [{ lessonId: lesson.id, title: lesson.text[locale === 'es' ? 'es' : 'en'].title, map }];
  }), [ioMap, locale]);
  const candidate = candidates.find((item) => item.lessonId === chosen) ?? candidates[0];
  const resolved = useMemo(() => (candidate ? resolvePlantMap(candidate.map, ioMap) : undefined), [candidate, ioMap]);
  const kind: PlantKind | undefined = candidate?.map.plant;

  const run = useMemo(() => (kind ? createPlantRun(kind) : undefined), [kind]);
  const lastKey = useRef<string | undefined>(undefined);
  const loop = useMemo(() => (run && resolved ? createPlantLoop({
    run, resolved,
    read: readDeclaredInputs,
    write: (point, value) => setDeclaredInput(point, value),
    cycles: async () => { try { const info = await adapter?.getInfo(); return typeof info?.cycles === 'number' ? info.cycles : null; } catch { return null; } },
  }) : undefined), [run, resolved, readDeclaredInputs, setDeclaredInput, adapter]);

  const refresh = useCallback(() => {
    if (run && kind) {
      const fact = plantFacts(kind, run.state);
      if (lastKey.current !== undefined && lastKey.current !== fact.key) announce(t(fact.key, fact.params));
      lastKey.current = fact.key;
    }
    setVersion((value) => value + 1);
  }, [run, kind, t]);

  const attempt = useCallback(async (work: () => Promise<void>) => {
    setMessage(undefined);
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : t('faceplate.failed')); }
    refresh();
  }, [refresh, t]);

  useEffect(() => {
    lastKey.current = undefined;
    if (!loop || !connected || !simulated) return undefined;
    loop.forget();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await attempt(() => loop.poll());
      if (!cancelled) timer = setTimeout(() => { void tick(); }, POLL_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [loop, connected, simulated, attempt]);

  const why = faceplateUnavailable({ hasMap: Boolean(debugMap), connected, simulated, vmState: controller?.vmState ?? 'disconnected', supported: true });
  const unavailable = !connected || !simulated || why !== null ? t('plant.unavailable.noSimulation') : !run || !kind || !loop ? t('plant.unavailable.noMapping') : undefined;

  return (
    <section className="border-b border-[var(--border-color)] p-3 text-sm text-[var(--text-secondary)]" aria-label={t('plant.title')} data-plant-panel>
      <h2 className="font-medium text-[var(--text-primary)]">{t('plant.title')}</h2>
      <p className="text-xs">{t('plant.hint')}</p>
      {unavailable !== undefined || !run || !kind || !loop ? <p className="mt-2" role="status">{unavailable ?? t('plant.unavailable.noMapping')}</p> : (
        <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <PlantView kind={kind} state={run.state} reads={loop.reads} sensed={run.sense()} />
          <div className="flex flex-col gap-2">
            {candidates.length > 1 && (
              <Select label={t('plant.mapping')} value={candidate?.lessonId} onChange={(event) => setChosen(event.target.value)} fieldClassName="text-xs">
                {candidates.map((item) => <option key={item.lessonId} value={item.lessonId}>{t('plant.mappingOption', { plant: item.map.plant, lesson: item.title })}</option>)}
              </Select>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => { run.setPaused(!run.paused); refresh(); announce(t(run.paused ? 'plant.paused' : 'plant.running')); }} data-plant-control="play-pause">
                {run.paused ? <><Play className="mr-1 inline" size={14} />{t('plant.play')}</> : <><Pause className="mr-1 inline" size={14} />{t('plant.pause')}</>}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { void attempt(() => loop.step()); }} disabled={!run.paused} data-plant-control="step"><SkipForward className="mr-1 inline" size={14} />{t('plant.step')}</Button>
              <Button variant="secondary" size="sm" onClick={() => { run.reset(); loop.forget(); refresh(); }} data-plant-control="reset"><RotateCcw className="mr-1 inline" size={14} />{t('plant.reset')}</Button>
              <output className="font-mono text-xs text-[var(--text-primary)]" data-plant-scans>{t('plant.scans', { count: run.tickCount })} · {run.paused ? t('plant.paused') : t('plant.running')}</output>
            </div>
            <div role="group" aria-label={t('plant.faults')} className="flex flex-wrap gap-2">
              {run.model.actions.map((action) => (
                <Button key={action} variant="secondary" size="sm" data-plant-action={action} aria-pressed={action === 'request' ? undefined : run.state[action === 'blocked' ? 'blocked' : action] === true}
                  onClick={() => { run.act(action); void attempt(() => loop.poll()); }}>{t(`plant.action.${action}` as 'plant.action.stall')}</Button>
              ))}
            </div>
            {message && <p role="alert" className="text-xs text-[var(--signal-fault-fg)]">{message}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
