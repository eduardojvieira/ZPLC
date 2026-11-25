/**
 * Operator panel (plan-vis C4): the push button, selector switch, emergency stop, indicator light, stack light, potentiometer
 * and numeric display. One control box draws one control, because each control is one signal of the scene.
 *
 * What a control stands on (a pedestal to the floor, a stack light's pole) is its stand: the pieces whose slot starts with `STAND`.
 * The model keeps them, so the bounds of a scene hold them; the view draws them as the control's station instead, one shared stand
 * for the controls that stand together (view/stations.ts).
 *
 * Every control faces up and toward +z of its pose, where an operator stands; the first view of a scene looks at it from the front
 * and low, so each state moves or shows something that stands up from the box, not only a change on its top face.
 */
import type { PartView, Vec3 } from '../../contracts';
import type { ControlStation } from '../controlStations';
import type { Role } from '../look';
import { box, MIN_STAND, piece, rod, rotate, type ModelContext, type ModelFamily, type Piece } from './shared';

/** The slots of a control's stand start with this. */
export const STAND = 'stand-';
export const isStand = (slot: string): boolean => slot.startsWith(STAND);

/** The control box of a push button, selector switch, emergency stop, indicator light and potentiometer: its top is 20 mm
 * below the pose. */
const ENCLOSURE = { size: [0.14, 0.12, 0.11] as Vec3, top: -0.02 } as const;
const enclosureBottom = ENCLOSURE.top - ENCLOSURE.size[1];

/** A point `r` from the vertical axis in the direction a piece turned by `yaw` points (yaw 0: straight ahead, away from +z), at `y`. */
const toward = (yaw: number, r: number, y: number): Vec3 => [-Math.sin(yaw) * r, y, -Math.cos(yaw) * r];

/**
 * The pedestal under a control (concept-station): a square column on a base plate bolted to the floor at `floor`, up to `top`; none
 * when the control sits too low for a column.
 */
function pedestal(floor: number, top: number): Piece[] {
  const plate = 0.012;
  const column = top - floor - plate;
  if (column <= MIN_STAND) return [];
  const bolts = [
    [-0.07, -0.07],
    [0.07, -0.07],
    [-0.07, 0.07],
    [0.07, 0.07],
  ] as const;
  return [
    piece(`${STAND}post`, box([0.06, column, 0.06], 0.004), [0, floor + plate + column / 2, 0], 'steel'),
    piece(`${STAND}base`, box([0.2, plate, 0.2], 0.003), [0, floor + plate / 2, 0], 'steel'),
    ...bolts.map(([x, z], k) => piece(`${STAND}bolt-${k}`, rod(0.009, 0.008, 'y'), [x, floor + plate + 0.004, z], 'steel')),
  ];
}

/**
 * The body a station's leader draws for all its members: one steel box over the station footprint from the floor up to the lowest
 * control box, and a plate at the floor, in the leader's frame (the footprint and heights are in world space).
 */
function stationBody(view: PartView, station: ControlStation): Piece[] {
  const [q0, q1, q2, q3] = view.pose.q;
  const local = (x: number, y: number, z: number) =>
    rotate([-q0, -q1, -q2, q3], [x - view.pose.p[0], y - view.pose.p[1], z - view.pose.p[2]]);
  // The body is square to the world: in the leader's frame it turns back by the leader's own yaw.
  const yaw = -2 * Math.atan2(view.pose.q[1], view.pose.q[3]);
  const plate = 0.01;
  const cx = (station.min[0] + station.max[0]) / 2;
  const cz = (station.min[1] + station.max[1]) / 2;
  const [w, d] = [station.max[0] - station.min[0], station.max[1] - station.min[1]];
  const height = station.top - station.floor - plate;
  return [
    ...(height > 0
      ? [piece('station-body', box([w, height, d], 0.004), local(cx, station.floor + plate + height / 2, cz), 'steel', true, yaw)]
      : []),
    piece('station-plate', box([w + 0.04, plate, d + 0.04], 0.003), local(cx, station.floor + plate / 2, cz), 'steel', true, yaw),
  ];
}

/** A control box in `role`, and its pedestal, or the station body when it leads a station (none when it follows one). */
const controlBox = (view: PartView, role: Role = 'housing', station: ControlStation | null = null): Piece[] => [
  piece('enclosure', box(ENCLOSURE.size, 0.01), [0, ENCLOSURE.top - ENCLOSURE.size[1] / 2, 0], role),
  ...(station ? (station.id === view.id ? stationBody(view, station) : []) : pedestal(-view.pose.p[1], enclosureBottom)),
];

// ---------------------------------------------------------------------------------------------------------------------
// Push button: the head travels into its collar while pressed
// ---------------------------------------------------------------------------------------------------------------------

export const PUSH_BUTTON = { collarTop: -0.006, released: 0.024, pressed: -0.003, head: 0.034, radius: 0.03 } as const;

function pushButtonModel(view: PartView, context: ModelContext): Piece[] {
  const pressed = view.state.pressed === true;
  const { collarTop, head } = PUSH_BUTTON;
  const headTop = pressed ? PUSH_BUTTON.pressed : PUSH_BUTTON.released;
  const [enclosure, ...stand] = controlBox(view, 'housing', context.station);
  return [
    piece('head', rod(PUSH_BUTTON.radius, head, 'y'), [0, headTop - head / 2, 0], 'head'),
    enclosure!,
    piece('collar', rod(PUSH_BUTTON.radius + 0.007, 0.014, 'y'), [0, collarTop - 0.007, 0], 'collar'),
    ...stand,
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Selector switch: a black lever on a knob turns to the selected position; a white mark on the box per position
// ---------------------------------------------------------------------------------------------------------------------

export const SELECTOR = { turn: Math.PI / 2, lever: [0.024, 0.04, 0.1] as Vec3, knobTop: 0.006, detentRadius: 0.047 } as const;

/** The turn of position `k` of `n`: from an eighth of a turn left of straight ahead (position 0) to as far right (the last). */
const selectorYaw = (k: number, n: number): number => SELECTOR.turn / 2 - (SELECTOR.turn * k) / Math.max(1, n - 1);

function selectorModel(view: PartView, context: ModelContext): Piece[] {
  const n = typeof view.state.positions === 'number' ? Math.max(2, Math.round(view.state.positions)) : 3;
  const at = typeof view.state.position === 'number' ? Math.min(n - 1, Math.max(0, Math.round(view.state.position))) : 0;
  const yaw = selectorYaw(at, n);
  const { lever, knobTop } = SELECTOR;
  const collarTop = ENCLOSURE.top + 0.012;
  return [
    ...controlBox(view, 'housing', context.station),
    piece('collar', rod(0.037, 0.012, 'y'), [0, ENCLOSURE.top + 0.006, 0], 'collar'),
    piece('knob', rod(0.028, knobTop - collarTop, 'y'), [0, (knobTop + collarTop) / 2, 0], 'rubber'),
    piece('lever', box(lever, 0.006), [0, knobTop + lever[1] / 2, 0], 'rubber', true, yaw),
    // A white line on the lever from its pivot to the end that points, as on a real selector's handle.
    piece('pointer', box([0.006, 0.002, 0.04], 0), toward(yaw, 0.025, knobTop + lever[1] + 0.001), 'mark', true, yaw),
    ...Array.from({ length: n }, (_, k) => {
      const turn = selectorYaw(k, n);
      const at = toward(turn, SELECTOR.detentRadius, ENCLOSURE.top + 0.001);
      return piece(`detent-${k}`, box([0.005, 0.002, 0.012], 0), at, 'mark', true, turn);
    }),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Emergency stop: a red mushroom head on a stem; latched, the head sits lower by its travel
// ---------------------------------------------------------------------------------------------------------------------

export const EMERGENCY_STOP = { released: 0.05, travel: 0.02, head: 0.03, radius: 0.045, stem: 0.012 } as const;

function emergencyStopModel(view: PartView, context: ModelContext): Piece[] {
  const { released, travel, head, radius, stem } = EMERGENCY_STOP;
  const headTop = view.state.pressed === true ? released - travel : released;
  const headBottom = headTop - head;
  return [
    ...controlBox(view, 'safety', context.station),
    piece('collar', rod(0.036, 0.012, 'y'), [0, ENCLOSURE.top + 0.006, 0], 'collar'),
    piece('stem', rod(stem, headBottom - ENCLOSURE.top, 'y'), [0, (headBottom + ENCLOSURE.top) / 2, 0], 'steel'),
    piece('head', rod(radius, head, 'y'), [0, headTop - head / 2, 0], 'painted'),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Indicator light: a round lens in a collar; lit, it takes the lamp look and a halo ring stands behind it
// ---------------------------------------------------------------------------------------------------------------------

export const INDICATOR = { lens: 0.03, lensRadius: 0.032, haloRadius: 0.05, haloThick: 0.004 } as const;

function indicatorModel(view: PartView, context: ModelContext): Piece[] {
  const lit = view.state.lit === true;
  const collarTop = ENCLOSURE.top + 0.012;
  return [
    ...controlBox(view, 'housing', context.station),
    piece('collar', rod(0.04, 0.012, 'y'), [0, ENCLOSURE.top + 0.006, 0], 'collar'),
    // The ring lies on the collar behind the lens, wider than it: lit shows a shape the unlit light does not have.
    ...(lit
      ? [piece('halo', rod(INDICATOR.haloRadius, INDICATOR.haloThick, 'y'), [0, collarTop + INDICATOR.haloThick / 2, 0], 'lamp')]
      : []),
    piece('lens', rod(INDICATOR.lensRadius, INDICATOR.lens, 'y'), [0, collarTop + INDICATOR.lens / 2, 0], lit ? 'lamp' : 'lampOff'),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Stack light: a steel pole from the floor with three segments, red on top, amber, green; a lit one is lamp and wider
// ---------------------------------------------------------------------------------------------------------------------

export const STACK_LIGHT = { segment: 0.07, off: 0.034, lit: 0.04, cap: 0.006, pole: 0.012 } as const;
const STACK_COLOURS = ['green', 'amber', 'red'] as const; // bottom to top
const SIGNAL_ROLE: Record<(typeof STACK_COLOURS)[number], readonly [Role, Role]> = {
  green: ['signalGreen', 'signalGreenOff'],
  amber: ['signalAmber', 'signalAmberOff'],
  red: ['signalRed', 'signalRedOff'],
};

function stackLightModel(view: PartView): Piece[] {
  const { segment, off, lit, cap, pole } = STACK_LIGHT;
  const floor = -view.pose.p[1];
  const rise = -floor > MIN_STAND ? -floor : 0;
  return [
    ...(rise ? [piece(`${STAND}pole`, rod(pole, rise, 'y'), [0, floor + rise / 2, 0], 'steel')] : []),
    ...(rise ? [piece(`${STAND}base`, box([0.12, 0.012, 0.12], 0.003), [0, floor + 0.006, 0], 'steel')] : []),
    // A ring at the foot of each segment is as wide as a lit one, so the footprint is the same lit or not.
    ...STACK_COLOURS.flatMap((colour, k) => {
      const base = k * segment;
      const on = view.state[colour] === true;
      return [
        piece(`ring-${colour}`, rod(lit, cap, 'y'), [0, base + cap / 2, 0], 'housing'),
        piece(
          `segment-${colour}`,
          rod(on ? lit : off, segment - cap, 'y'),
          [0, base + cap + (segment - cap) / 2, 0],
          SIGNAL_ROLE[colour][on ? 0 : 1],
        ),
      ];
    }),
    piece('cap', rod(lit, cap, 'y'), [0, STACK_COLOURS.length * segment + cap / 2, 0], 'housing'),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Potentiometer: a knob on a control box; a white pointer turns from -135 degrees at the minimum to +135 at the maximum
// ---------------------------------------------------------------------------------------------------------------------

export const POTENTIOMETER = { sweep: (270 * Math.PI) / 180, knob: 0.03, radius: 0.03 } as const;

function potentiometerModel(view: PartView, context: ModelContext): Piece[] {
  const f = typeof view.state.fraction === 'number' ? Math.min(1, Math.max(0, view.state.fraction)) : 0;
  const yaw = (f - 0.5) * POTENTIOMETER.sweep;
  const collarTop = ENCLOSURE.top + 0.012;
  const knobTop = collarTop + POTENTIOMETER.knob;
  return [
    ...controlBox(view, 'housing', context.station),
    piece('collar', rod(0.04, 0.012, 'y'), [0, ENCLOSURE.top + 0.006, 0], 'collar'),
    piece('knob', rod(POTENTIOMETER.radius, POTENTIOMETER.knob, 'y'), [0, collarTop + POTENTIOMETER.knob / 2, 0], 'rubber'),
    piece('pointer', box([0.008, 0.002, 0.03], 0), toward(yaw, 0.015, knobTop + 0.001), 'mark', true, yaw),
    // The printed scale on the box around the collar: a tick at the minimum, the middle and the maximum.
    ...[-1, 0, 1].map((k) =>
      piece(`tick-${k + 1}`, box([0.004, 0.002, 0.014], 0), toward((k * 3 * Math.PI) / 4, 0.058, ENCLOSURE.top + 0.001), 'mark', true, (k * 3 * Math.PI) / 4),
    ),
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Numeric display: a dark window on the face of a control box, and in front of it red seven-segment digits (lit segments only)
// ---------------------------------------------------------------------------------------------------------------------

export const NUMERIC_DISPLAY = {
  window: [0.12, 0.06] as const,
  pitch: 0.022,
  width: 0.014,
  height: 0.034,
  bar: 0.004,
  maxCells: 5,
} as const;

/** The lit segments of each digit, a to g: top, upper right, lower right, bottom, lower left, upper left, middle. */
const SEGMENTS: Readonly<Record<string, string>> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abdeg',
  '3': 'abcdg',
  '4': 'bcfg',
  '5': 'acdfg',
  '6': 'acdefg',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
};

/** The segment `name` of the cell centred at `x`, on the window at `z`. */
function segment(cell: number, name: string, x: number, y: number, z: number): Piece {
  const { width: w, height: h, bar } = NUMERIC_DISPLAY;
  const k = 'abcdefg'.indexOf(name);
  const horizontal = k === 0 || k === 3 || k === 6;
  const size: Vec3 = horizontal ? [w, bar, 0.002] : [bar, h / 2 - bar, 0.002];
  const dx = horizontal ? 0 : k === 1 || k === 2 ? w / 2 - bar / 2 : -w / 2 + bar / 2;
  const dy = k === 0 ? h / 2 - bar / 2 : k === 3 ? -h / 2 + bar / 2 : k === 6 ? 0 : k === 1 || k === 5 ? h / 4 : -h / 4;
  return piece(`d${cell}-${name}`, box(size, 0), [x + dx, y + dy, z], 'signalRed');
}

function numericDisplayModel(view: PartView, context: ModelContext): Piece[] {
  const { window: win, pitch, maxCells } = NUMERIC_DISPLAY;
  const { value, min, max } = view.state;
  const range = typeof min === 'number' && typeof max === 'number' ? { min, max } : { min: 0, max: 100 };
  const places = Math.max(String(Math.round(Math.abs(range.min))).length, String(Math.round(Math.abs(range.max))).length);
  const cells = Math.min(maxCells, places + (range.min < 0 ? 1 : 0));
  const v = typeof value === 'number' ? Math.round(value) : NaN;
  // Outside the range (or no number): a dash in every cell. Otherwise the digits, right-aligned, with the minus just before them.
  const text = v >= Math.round(range.min) && v <= Math.round(range.max) ? String(v).padStart(cells) : '-'.repeat(cells);
  const face = ENCLOSURE.size[2] / 2;
  const y = ENCLOSURE.top - ENCLOSURE.size[1] / 2;
  return [
    ...controlBox(view, 'housing', context.station),
    piece('window', box([win[0], win[1], 0.002], 0), [0, y, face + 0.001], 'lens'),
    ...[...text].flatMap((ch, i) =>
      [...(SEGMENTS[ch] ?? '')].map((name) => segment(i, name, (i - (cells - 1) / 2) * pitch, y, face + 0.003)),
    ),
  ];
}

export const OPERATOR: ModelFamily = {
  'push-button': pushButtonModel,
  'selector-switch': selectorModel,
  'emergency-stop': emergencyStopModel,
  'indicator-light': indicatorModel,
  'stack-light': stackLightModel,
  potentiometer: potentiometerModel,
  'numeric-display': numericDisplayModel,
};
