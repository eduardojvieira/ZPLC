/**
 * Operator panel (plan-vis C4): the push button, and the selector switch, emergency stop, indicator light, stack light,
 * potentiometer and numeric display the catalogue step adds here. One control box draws one control, because each control is one
 * signal of the scene; several controls side by side are a station.
 */
import type { PartView } from '../../contracts';
import { box, MIN_STAND, piece, rod, type ModelFamily, type Piece } from './shared';

// ---------------------------------------------------------------------------------------------------------------------
// Push button: a control box on a pedestal (a square column on a base plate bolted to the floor); the head travels into its
// collar while pressed
// ---------------------------------------------------------------------------------------------------------------------

export const PUSH_BUTTON = { collarTop: -0.006, released: 0.024, pressed: -0.003, head: 0.034, radius: 0.03 } as const;

function pushButtonModel(view: PartView): Piece[] {
  const pressed = view.state.pressed === true;
  const floor = -view.pose.p[1];
  const { collarTop, head } = PUSH_BUTTON;
  const headTop = pressed ? PUSH_BUTTON.pressed : PUSH_BUTTON.released;
  const pieces: Piece[] = [
    piece('head', rod(PUSH_BUTTON.radius, head, 'y'), [0, headTop - head / 2, 0], 'head'),
    piece('enclosure', box([0.14, 0.12, 0.11], 0.01), [0, -0.08, 0], 'housing'),
    piece('collar', rod(PUSH_BUTTON.radius + 0.007, 0.014, 'y'), [0, collarTop - 0.007, 0], 'collar'),
  ];
  const plate = 0.012;
  const column = -0.14 - floor - plate;
  if (column > MIN_STAND) {
    pieces.push(piece('post', box([0.06, column, 0.06], 0.004), [0, floor + plate + column / 2, 0], 'steel'));
    pieces.push(piece('base', box([0.2, plate, 0.2], 0.003), [0, floor + plate / 2, 0], 'steel'));
    for (const [k, x, z] of [
      [0, -0.07, -0.07],
      [1, 0.07, -0.07],
      [2, -0.07, 0.07],
      [3, 0.07, 0.07],
    ] as const)
      pieces.push(piece(`bolt-${k}`, rod(0.009, 0.008, 'y'), [x, floor + plate + 0.004, z], 'steel'));
  }
  return pieces;
}

export const OPERATOR: ModelFamily = { 'push-button': pushButtonModel };
