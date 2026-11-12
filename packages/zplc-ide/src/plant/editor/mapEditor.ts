import type { PlantSignalDef } from '../contracts';
import type { IoMap } from '../../runtime/ioMap';
import { normalizePlantMap, resolvePlantMap, type PlantMap, type PlantMapV2, type PlantSignal, type SignalRange } from '../../plants/plantMap';
import type { ProblemAt } from './validate';

export interface MapEditor {
  map(): PlantMapV2;
  /** `range` is the scaling of an INT or REAL signal; it is never invented. Returns a problem when the point is not `Program.Name`. */
  bind(signal: string, point: string, range?: SignalRange): ProblemAt | null;
  unbind(signal: string): void;
  /** Unbound signals, unknown points, type mismatches and missing scalings, each located at its signal. */
  check(ioMap: IoMap): ProblemAt[];
  /** A schema 1 or 2 map, read through `normalizePlantMap`; entries for signals the scene does not have are kept and reported by `check`. */
  load(map: PlantMap): void;
}

const POINT = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;
const at = (signal: string, message: string): ProblemAt => ({ partId: null, path: `signals.${signal}`, message });

interface Binding {
  point: string;
  range?: SignalRange;
}

/** Binds the signals a scene declares to program points, only ever by an explicit call (LNK-002). */
export function createMapEditor(signals: readonly PlantSignalDef[], scene: string): MapEditor {
  const bindings = new Map<string, Binding>();
  const def = (name: string) => signals.find((s) => s.name === name);

  const map = (): PlantMapV2 => ({
    schemaVersion: 2,
    target: { scene },
    signals: Object.fromEntries(
      signals.flatMap((s) => {
        const b = bindings.get(s.name);
        if (!b) return [];
        return [[s.name, { direction: s.direction, type: s.type, point: b.point, ...(s.type !== 'BOOL' && b.range ? { range: b.range } : {}) }]];
      }),
    ),
  });

  return {
    map,
    bind(signal, point, range) {
      if (!def(signal)) return at(signal, `${signal} is not a signal of this scene`);
      if (!POINT.test(point)) return at(signal, `${signal}: the point must be "Program.Name", not "${point}"`);
      bindings.set(signal, { point, ...(range ? { range } : {}) });
      return null;
    },
    unbind: (signal) => void bindings.delete(signal),
    check(ioMap) {
      const problems: ProblemAt[] = [];
      for (const name of bindings.keys()) if (!def(name)) problems.push(at(name, `${name} is not a signal of this scene`));
      const resolved = resolvePlantMap(map(), ioMap).problems;
      for (const s of signals) {
        const b = bindings.get(s.name);
        if (!b) {
          problems.push(at(s.name, `${s.name}: the ${s.direction} signal is not bound to a program point`));
          continue;
        }
        const found = (s.direction === 'command' ? ioMap.outputs : ioMap.inputs).find((p) => p.path === b.point);
        const own = resolved.find((m) => m.startsWith(`${s.name}: `));
        if (own) problems.push(at(s.name, own));
        else if (found && found.type !== s.type) problems.push(at(s.name, `${s.name}: ${b.point} is ${found.type}, the signal is ${s.type}`));
        if (s.type !== 'BOOL' && !b.range) problems.push(at(s.name, `${s.name}: an ${s.type} signal needs its scaling range`));
      }
      return problems;
    },
    load(loaded) {
      bindings.clear();
      for (const s of normalizePlantMap(loaded).signals as PlantSignal[])
        bindings.set(s.name, { point: s.point, ...(s.range ? { range: s.range } : {}) });
    },
  };
}
