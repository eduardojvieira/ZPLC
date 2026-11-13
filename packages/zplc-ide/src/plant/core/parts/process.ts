import type { ConfigField, FactValue, PlantSignalDef, ScenePart, Vec3 } from '../../contracts';
import { cfg, cfgNumber, type PartRuntime, type RuntimePartDefinition } from './items';
import { marker } from './sensors';

/** The plant step in seconds (PLANT_STEP_MS / 1000). A test pins the two together. */
export const DT_S = 0.005;

/**
 * Square root by Newton iteration with `+ - * /` only, so it is identical on every platform (PLT-009, determinism).
 * Fixed 40 iterations from the seed (1 + v) / 2 (never below the root): reaches double precision for v from 1e-12 to 1e6.
 */
export function detSqrt(v: number): number {
  if (!(v > 0)) return 0;
  let x = (1 + v) / 2;
  for (let i = 0; i < 40; i += 1) x = (x + v / x) / 2;
  return x;
}

export interface TankParams {
  areaM2: number;
  heightM: number;
  inletMaxLps: number;
  outletCoef: number;
  valveTauS: number;
  leakLps: number;
}
export interface TankState {
  h: number;
  uIn: number;
  uOut: number;
  spilledL: number;
}
export interface TankInput {
  targetIn: number;
  targetOut: number;
  inletStuck: boolean;
  outletStuck: boolean;
  leak: boolean;
}
export interface TankStep {
  state: TankState;
  qIn: number;
  qOut: number;
  /** Litres that really moved in this step (a tank cannot give what it does not hold), for the conservation check. */
  filledL: number;
  drainedL: number;
  leakedL: number;
  spillL: number;
}

/** One plant step, pure. The equations are those of `TANK_EQUATIONS`, in this order. */
export function stepTank(s: TankState, i: TankInput, p: TankParams, dtS: number): TankStep {
  const lag = (u: number, target: number, stuck: boolean): number => {
    const t = stuck ? u : target;
    return p.valveTauS <= dtS ? t : u + ((t - u) * dtS) / p.valveTauS;
  };
  const uIn = lag(s.uIn, i.targetIn, i.inletStuck);
  const uOut = lag(s.uOut, i.targetOut, i.outletStuck);
  const qIn = p.inletMaxLps * uIn;
  const qOut = p.outletCoef * uOut * detSqrt(s.h);
  const qLeak = i.leak ? p.leakLps : 0;
  const litres = 1000 * p.areaM2;
  const raw = s.h + ((qIn - qOut - qLeak) * dtS) / litres;
  let h = raw;
  let drainedL = qOut * dtS;
  let leakedL = qLeak * dtS;
  if (raw < 0) {
    const want = drainedL + leakedL;
    const short = -raw * litres; // what the tank could not give
    const f = want > 0 ? (want - short) / want : 0;
    drainedL *= f;
    leakedL *= f;
    h = 0;
  }
  let spillL = 0;
  let spilledL = s.spilledL;
  if (h > p.heightM) {
    spillL = (h - p.heightM) * litres;
    spilledL += spillL;
    h = p.heightM;
  }
  return { state: { h, uIn, uOut, spilledL }, qIn, qOut, filledL: qIn * dtS, drainedL, leakedL, spillL };
}

const TANK_EQUATIONS = {
  en:
    'State: level h (m), valve openings uIn and uOut (0 to 1), spilled volume (L). Area A = widthM * depthM (m2); step dt = 0.005 s. ' +
    'Per step, in order: (1) valve target: digital TRUE is 1 and FALSE is 0, numeric is clamp(value, 0, 100) / 100; a stuck valve ' +
    'keeps its opening. (2) First-order valve lag: u = target if valveTauS <= dt, else u = u + (target - u) * dt / valveTauS. ' +
    '(3) Flows in L/s: qIn = inletMaxLps * uIn; gravity discharge (Torricelli) qOut = outletCoef * uOut * sqrt(h); with the leak fault ' +
    'a constant leakLps also leaves. (4) Level: h = h + (qIn - qOut - qLeak) * dt / (1000 * A), never below 0. (5) Overflow: if h > ' +
    'heightM then spilled = spilled + (h - heightM) * 1000 * A and h = heightM. The square root is Newton iteration with + - * / only ' +
    '(12 iterations, seed 1 for h >= 1 and h otherwise), so a run is bit for bit repeatable. At full opening a tank empties in finite ' +
    'time 2 * sqrt(h0) * 1000 * A / outletCoef.',
  es:
    'Estado: nivel h (m), aperturas de válvula uIn y uOut (0 a 1), volumen derramado (L). Área A = widthM * depthM (m2); paso ' +
    'dt = 0,005 s. En cada paso, en orden: (1) objetivo de la válvula: en digital VERDADERO es 1 y FALSO es 0, en numérico es ' +
    'clamp(valor, 0, 100) / 100; una válvula atascada conserva su apertura. (2) Retardo de primer orden de la válvula: u = objetivo ' +
    'si valveTauS <= dt, si no u = u + (objetivo - u) * dt / valveTauS. (3) Caudales en L/s: qIn = inletMaxLps * uIn; descarga por ' +
    'gravedad (Torricelli) qOut = outletCoef * uOut * raíz(h); con la falla de fuga sale además una constante leakLps. (4) Nivel: ' +
    'h = h + (qIn - qOut - qLeak) * dt / (1000 * A), nunca por debajo de 0. (5) Desborde: si h > heightM entonces derramado = ' +
    'derramado + (h - heightM) * 1000 * A y h = heightM. La raíz cuadrada es una iteración de Newton solo con + - * / (12 ' +
    'iteraciones, semilla 1 si h >= 1 y h en otro caso), de modo que una ejecución se repite bit a bit. Con apertura total un ' +
    'tanque se vacía en un tiempo finito 2 * raíz(h0) * 1000 * A / outletCoef.',
};

const FIELDS: Readonly<Record<string, ConfigField>> = {
  variant: { kind: 'enum', values: ['digital', 'numeric'], default: 'numeric' },
  widthM: { kind: 'number', min: 0.2, max: 2, default: 0.4, unit: 'm' },
  depthM: { kind: 'number', min: 0.2, max: 2, default: 0.25, unit: 'm' },
  heightM: { kind: 'number', min: 0.3, max: 2, default: 1, unit: 'm' },
  initialFraction: { kind: 'number', min: 0, max: 1, default: 0 },
  inletMaxLps: { kind: 'number', min: 1, max: 50, default: 20, unit: 'L/s' },
  outletCoef: { kind: 'number', min: 1, max: 50, default: 12, unit: 'L/s per square root of m' },
  valveTauS: { kind: 'number', min: 0, max: 5, default: 0.5, unit: 's' },
  highFraction: { kind: 'number', min: 0.5, max: 1, default: 0.8 },
  lowFraction: { kind: 'number', min: 0, max: 0.5, default: 0.2 },
  bandLow: { kind: 'number', min: 0, max: 1, default: 0 },
  bandHigh: { kind: 'number', min: 0, max: 1, default: 1 },
  leakLps: { kind: 'number', min: 0, max: 10, default: 1, unit: 'L/s' },
};
const num = (part: ScenePart, key: string): number => cfgNumber(part, FIELDS, key);
const isNumeric = (part: ScenePart): boolean => cfg(part, FIELDS, 'variant') === 'numeric';
const paramsOf = (part: ScenePart): TankParams => ({
  areaM2: num(part, 'widthM') * num(part, 'depthM'),
  heightM: num(part, 'heightM'),
  inletMaxLps: num(part, 'inletMaxLps'),
  outletCoef: num(part, 'outletCoef'),
  valveTauS: num(part, 'valveTauS'),
  leakLps: num(part, 'leakLps'),
});
const round = (v: number, step: number): number => Math.round(v / step) * step;

function tankSignals(part: ScenePart): PlantSignalDef[] {
  const n = part.name;
  if (!isNumeric(part)) {
    return [
      { name: `${n}.fill`, direction: 'command', type: 'BOOL' },
      { name: `${n}.drain`, direction: 'command', type: 'BOOL' },
      { name: `${n}.levelLow`, direction: 'sensor', type: 'BOOL' },
      { name: `${n}.levelHigh`, direction: 'sensor', type: 'BOOL' },
    ];
  }
  const p = paramsOf(part);
  return [
    { name: `${n}.fill`, direction: 'command', type: 'REAL', unit: '%', range: { min: 0, max: 100 } },
    { name: `${n}.drain`, direction: 'command', type: 'REAL', unit: '%', range: { min: 0, max: 100 } },
    { name: `${n}.level`, direction: 'sensor', type: 'REAL', unit: 'm', range: { min: 0, max: p.heightM } },
    { name: `${n}.flowIn`, direction: 'sensor', type: 'REAL', unit: 'L/s', range: { min: 0, max: p.inletMaxLps } },
    {
      name: `${n}.flowOut`,
      direction: 'sensor',
      type: 'REAL',
      unit: 'L/s',
      range: { min: 0, max: p.outletCoef * detSqrt(p.heightM) },
    },
  ];
}

function tankRuntime(part: ScenePart): PartRuntime {
  const n = part.name;
  const numeric = isNumeric(part);
  const p = paramsOf(part);
  const high = num(part, 'highFraction');
  const low = Math.min(num(part, 'lowFraction'), high); // the part never reports a low switch above the high one
  const bandLow = num(part, 'bandLow') * p.heightM;
  const bandHigh = num(part, 'bandHigh') * p.heightM;
  let s: TankState = { h: num(part, 'initialFraction') * p.heightM, uIn: 0, uOut: 0, spilledL: 0 };
  let targetIn = 0;
  let targetOut = 0;
  let inletStuck = false;
  let outletStuck = false;
  let leak = false;
  let levelFrozen: { level: number; low: boolean; high: boolean } | undefined;
  let qIn = 0;
  let qOut = 0;
  let spilling = false;
  let highs = 0;
  let wasHigh = s.h >= high * p.heightM;
  const target = (v: boolean | number | undefined, prev: number): number => {
    if (numeric) return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 100) / 100 : prev;
    return v === true ? 1 : v === false ? 0 : prev;
  };
  const reading = () => levelFrozen ?? { level: s.h, low: s.h <= low * p.heightM, high: s.h >= high * p.heightM };
  const sensed = (): Record<string, boolean | number> => {
    const r = reading();
    if (!numeric) return { [`${n}.levelLow`]: r.low, [`${n}.levelHigh`]: r.high };
    return {
      [`${n}.level`]: Math.min(Math.max(r.level, 0), p.heightM),
      [`${n}.flowIn`]: qIn,
      [`${n}.flowOut`]: Math.min(qOut, p.outletCoef * detSqrt(p.heightM)),
    };
  };
  return {
    build() {},
    beforeStep(commands) {
      targetIn = target(commands[`${n}.fill`], targetIn);
      targetOut = target(commands[`${n}.drain`], targetOut);
    },
    afterStep() {
      const r = stepTank(s, { targetIn, targetOut, inletStuck, outletStuck, leak }, p, DT_S);
      s = r.state;
      qIn = r.qIn;
      qOut = r.qOut;
      spilling = r.spillL > 0;
      const isHigh = s.h >= high * p.heightM;
      if (isHigh && !wasHigh) highs += 1;
      wasHigh = isHigh;
    },
    sense: sensed,
    facts: (): Record<string, FactValue> => ({
      [`level:${n}`]: round(s.h, 0.001),
      [`volume:${n}`]: round(s.h * p.areaM2 * 1000, 0.1),
      [`spilledL:${n}`]: round(s.spilledL, 0.1),
      [`highs:${n}`]: highs,
      [`inBand:${n}`]: s.h >= bandLow && s.h <= bandHigh,
    }),
    act(action) {
      if (action === 'inletStuck') inletStuck = true;
      else if (action === 'outletStuck') outletStuck = true;
      else if (action === 'levelStuck') levelFrozen = reading();
      else if (action === 'leak') leak = true;
      else throw new Error(`part "${n}" has no action "${action}"`);
    },
    views: () => {
      const pos = part.position;
      const centre: Vec3 = [pos[0], pos[1] + p.heightM / 2, pos[2]];
      return [
        {
          id: part.id,
          part: 'tank',
          name: n,
          pose: marker(part, 'tank', [num(part, 'widthM'), p.heightM, num(part, 'depthM')], centre),
          state: { level: s.h, heightM: p.heightM, fraction: s.h / p.heightM, spilling },
          signals: sensed(),
        },
      ];
    },
  };
}

const tank: RuntimePartDefinition = {
  id: 'tank',
  family: 'process',
  names: { en: 'Tank', es: 'Tanque' },
  config: FIELDS,
  signals: tankSignals,
  actions: ['inletStuck', 'outletStuck', 'levelStuck', 'leak'],
  snapPoints: (part) => {
    const x = num(part, 'widthM') / 2;
    const z = num(part, 'depthM') / 2;
    return (
      [
        [x, z],
        [x, -z],
        [-x, z],
        [-x, -z],
      ] as const
    ).map(([dx, dz], i) => ({
      name: `corner${i}`,
      position: [dx, 0, dz] as const,
      normalYDeg: 0,
      accepts: [],
    }));
  },
  doc: {
    en:
      'A tank filled through an inlet valve and drained by gravity through an outlet valve. The digital variant has on/off valves ' +
      '(fill, drain) and two level switches (levelLow, levelHigh); the numeric variant has proportional valves (fill, drain, 0 to 100 %) ' +
      'and meters (level in m, flowIn and flowOut in L/s). Facts: level, volume, spilledL, highs, inBand. Faults: inletStuck, ' +
      'outletStuck, levelStuck, leak. It is a numeric model, not a fluid simulation; the equations are listed below.',
    es:
      'Un tanque que se llena por una válvula de entrada y se vacía por gravedad por una válvula de salida. La variante digital tiene ' +
      'válvulas todo o nada (fill, drain) y dos interruptores de nivel (levelLow, levelHigh); la variante numérica tiene válvulas ' +
      'proporcionales (fill, drain, 0 a 100 %) e instrumentos (level en m, flowIn y flowOut en L/s). Hechos: level, volume, spilledL, ' +
      'highs, inBand. Fallas: inletStuck, outletStuck, levelStuck, leak. Es un modelo numérico, no una simulación de fluidos; las ' +
      'ecuaciones se listan a continuación.',
  },
  equations: TANK_EQUATIONS,
  runtime: tankRuntime,
};

/** Process models: numeric, stepped on the plant clock, no rigid body (PLT-009). Not registered here; the core registers them. */
export const processParts: readonly RuntimePartDefinition[] = [tank];
