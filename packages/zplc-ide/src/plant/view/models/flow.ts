/**
 * Flow control, sources and sinks (plan-vis C2): the emitter, and the stop blade, pusher, diverter arm, aligner, chute and remover
 * the catalogue step adds here.
 */
import { box, piece, type ModelFamily, type Piece } from './shared';

// ---------------------------------------------------------------------------------------------------------------------
// Emitter: the zone where items appear, marked by four flat corner marks on the surface they appear on, like the zone markings of
// a factory floor (a simulation device, not a machine)
// ---------------------------------------------------------------------------------------------------------------------

export const EMITTER = { size: 0.3, mark: 0.07, bar: 0.012, thickness: 0.002 } as const;

function emitterModel(): Piece[] {
  const { size, mark, bar, thickness } = EMITTER;
  const h = size / 2;
  const y = 0.001 + thickness / 2; // just above the surface, so the band does not cover it
  const pieces: Piece[] = [];
  for (const [i, sx, sz] of [
    [0, -1, -1],
    [1, 1, -1],
    [2, -1, 1],
    [3, 1, 1],
  ] as const) {
    pieces.push(piece(`corner-${i}-x`, box([mark, thickness, bar], 0), [sx * (h - mark / 2), y, sz * (h - bar / 2)], 'zone'));
    pieces.push(
      piece(`corner-${i}-z`, box([bar, thickness, mark - bar], 0), [sx * (h - bar / 2), y, sz * (h - bar - (mark - bar) / 2)], 'zone'),
    );
  }
  return pieces;
}

export const FLOW: ModelFamily = { emitter: emitterModel };
