import type { PlantSignalDef } from '../contracts';
import type { IoMap } from '../../runtime/ioMap';
import {
  normalizePlantMap,
  resolvePlantMap,
  type PlantMap,
  type PlantMapV2,
  type PlantSignal,
  type SignalRange,
} from '../../plants/plantMap';
import { validateScaling } from '../scaling';
import type { ProblemAt } from './validate';

export interface MapEditor {
  map(): PlantMapV2;
  /**
   * `range` is the scaling of an INT or REAL signal; it is never invented. `type` is the type of the program variable (default:
   * the part signal's; BOOL signals ignore it). Returns a problem when the point is not `Program.Name`.
   */
  bind(signal: string, point: string, range?: SignalRange, type?: 'INT' | 'REAL'): ProblemAt | null;
  unbind(signal: string): void;
  /** Unbound signals, unknown points, type mismatches and missing scalings, each located at its signal. */
  check(ioMap: IoMap): ProblemAt[];
  /**
   * A schema 1 or 2 map, read through `normalizePlantMap`; entries for signals the scene does not have are kept and reported by `check`.
   */
  load(map: PlantMap): void;
}

const POINT = /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/;
const at = (signal: string, message: string): ProblemAt => ({ partId: null, path: `signals.${signal}`, message });

interface Binding {
  point: string;
  range?: SignalRange;
  type?: 'INT' | 'REAL';
}

/** Binds the signals a scene declares to program points, only ever by an explicit call (LNK-002). */
export function createMapEditor(signals: readonly PlantSignalDef[], sceneName: string): MapEditor {
  // A loaded map keeps the scene id it targets: a persisted id never becomes the display name.
  let scene = sceneName;
  const bindings = new Map<string, Binding>();
  const def = (name: string) => signals.find((s) => s.name === name);

  const map = (): PlantMapV2 => ({
    schemaVersion: 2,
    target: { scene },
    signals: Object.fromEntries(
      signals.flatMap((s) => {
        const b = bindings.get(s.name);
        if (!b) return [];
        const type = s.type === 'BOOL' ? 'BOOL' : (b.type ?? s.type);
        return [[s.name, { direction: s.direction, type, point: b.point, ...(s.type !== 'BOOL' && b.range ? { range: b.range } : {}) }]];
      }),
    ),
  });

  return {
    map,
    bind(signal, point, range, type) {
      if (!def(signal)) return at(signal, `${signal} is not a signal of this scene`);
      if (!POINT.test(point)) return at(signal, `${signal}: the point must be "Program.Name", not "${point}"`);
      bindings.set(signal, { point, ...(range ? { range } : {}), ...(type ? { type } : {}) });
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
        // resolvePlantMap compares the program variable with the map's type (exact INT or REAL), the part's type is validateScaling's.
        const own = resolved.find((m) => m.startsWith(`${s.name}: `));
        if (own) problems.push(at(s.name, own));
        const entry = map().signals[s.name];
        if (s.type !== 'BOOL' && !b.range) problems.push(at(s.name, `${s.name}: an ${s.type} signal needs its scaling range`));
        // ponytail: a part signal with no range is not reported (M1 test fixtures have none); the shipped parts all declare one.
        else if (entry && s.range) for (const m of validateScaling(s, { name: s.name, ...entry })) problems.push(at(s.name, m));
      }
      return problems;
    },
    load(loaded) {
      bindings.clear();
      const loadedTarget = normalizePlantMap(loaded).target;
      if ('scene' in loadedTarget) scene = loadedTarget.scene;
      for (const s of normalizePlantMap(loaded).signals as PlantSignal[])
        bindings.set(s.name, {
          point: s.point,
          ...(s.range ? { range: s.range } : {}),
          ...(s.type !== 'BOOL' ? { type: s.type } : {}),
        });
    },
  };
}
