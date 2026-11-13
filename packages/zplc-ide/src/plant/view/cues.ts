import type { PartView, Vec3 } from '../contracts';

/**
 * State cues of a part (VIS-003). Pure: reads one `PartView`, draws nothing.
 * `stateWord` is the English word of the UX-009 signal vocabulary and `stateKey` its catalogue key
 * (`signal.cue.*`, moduleText), so the panel can show the Spanish word. Every state also has its own `marker`, so no
 * state is told by colour alone.
 */
export type CueMarker = 'solid' | 'dashed' | 'dotted' | 'outline';
export type CueState = 'true' | 'false' | 'unknown' | 'forced' | 'fault';

export interface PartCues {
  beam?: { from: Vec3; to: Vec3; detecting: boolean };
  label: string;
  stateWord: string;
  stateKey: `signal.cue.${CueState}`;
  state: CueState;
  marker: CueMarker;
  /** A numeric part's reading: locale-neutral text and the fraction of its range (0..1). No sentence (N8 owns those). */
  value?: { text: string; fraction: number };
}

const WORDS: Readonly<Record<CueState, string>> = {
  true: 'Confirmed TRUE',
  false: 'FALSE',
  unknown: 'Not read yet',
  forced: 'Forced by the user',
  fault: 'Fault',
};
const MARKERS: Readonly<Record<CueState, CueMarker>> = {
  true: 'solid',
  false: 'dashed',
  unknown: 'dotted',
  forced: 'outline',
  fault: 'outline',
};
// Signal suffixes, in order, that say whether a part is active: sensors detect, actuators run, extend, light, press.
const ACTIVE_SUFFIXES = ['detect', 'extended', 'run', 'extend', 'pressed', 'lit', 'emit'] as const;

function stateOf(view: PartView): CueState {
  if (view.state.fault === true) return 'fault';
  if (view.state.forced === true) return 'forced';
  const entries = Object.entries(view.signals);
  if (entries.length === 0) return 'unknown';
  if (view.part === 'emergency-stop') return view.signals[`${view.name}.ok`] === false ? 'false' : 'true';
  for (const suffix of ACTIVE_SUFFIXES) {
    const hit = entries.find(([k]) => k === suffix || k.endsWith(`.${suffix}`));
    if (hit) return hit[1] ? 'true' : 'false';
  }
  // A numeric part has a reading, and its information is the value: 0 is a reading, not FALSE.
  if (entries.every(([, v]) => typeof v === 'number')) return 'true';
  return entries.some(([, v]) => Boolean(v)) ? 'true' : 'false';
}

const rotate = ([x, y, z, w]: readonly [number, number, number, number], [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function valueOf(view: PartView): PartCues['value'] {
  const { text, fraction, level } = view.state;
  if (!finite(fraction)) return undefined;
  const shown = typeof text === 'string' ? text : finite(level) ? `${level.toFixed(2)} m` : undefined;
  return shown === undefined ? undefined : { text: shown, fraction: Math.min(Math.max(fraction, 0), 1) };
}

export function cuesFor(view: PartView): PartCues {
  const state = stateOf(view);
  const cues: PartCues = {
    label: view.name,
    stateWord: WORDS[state],
    stateKey: `signal.cue.${state}`,
    state,
    marker: MARKERS[state],
  };
  // The emergency stop opens its ok contact when pressed or broken: the alarming state has the outline marker.
  if (view.part === 'emergency-stop' && state === 'false') cues.marker = 'outline';
  const value = valueOf(view);
  if (value) cues.value = value;
  if (view.part === 'sensor') {
    // Assumption: the beam leaves along the sensor's local +X for `state.beamLength` metres (default 1).
    const len = typeof view.state.beamLength === 'number' && view.state.beamLength > 0 ? view.state.beamLength : 1;
    const d = rotate(view.pose.q, [len, 0, 0]);
    const [x, y, z] = view.pose.p;
    cues.beam = { from: [x, y, z], to: [x + d[0], y + d[1], z + d[2]], detecting: state === 'true' };
  }
  return cues;
}
