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
  for (const suffix of ACTIVE_SUFFIXES) {
    const hit = entries.find(([k]) => k === suffix || k.endsWith(`.${suffix}`));
    if (hit) return hit[1] ? 'true' : 'false';
  }
  return entries.some(([, v]) => Boolean(v)) ? 'true' : 'false';
}

const rotate = ([x, y, z, w]: readonly [number, number, number, number], [vx, vy, vz]: Vec3): Vec3 => {
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
};

export function cuesFor(view: PartView): PartCues {
  const state = stateOf(view);
  const cues: PartCues = {
    label: view.name,
    stateWord: WORDS[state],
    stateKey: `signal.cue.${state}`,
    state,
    marker: MARKERS[state],
  };
  if (view.part === 'sensor') {
    // Assumption: the beam leaves along the sensor's local +X for `state.beamLength` metres (default 1).
    const len = typeof view.state.beamLength === 'number' && view.state.beamLength > 0 ? view.state.beamLength : 1;
    const d = rotate(view.pose.q, [len, 0, 0]);
    const [x, y, z] = view.pose.p;
    cues.beam = { from: [x, y, z], to: [x + d[0], y + d[1], z + d[2]], detecting: state === 'true' };
  }
  return cues;
}
