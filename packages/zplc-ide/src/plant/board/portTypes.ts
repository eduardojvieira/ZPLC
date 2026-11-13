/**
 * @file portTypes.ts
 * @brief The narrow view of the single link owner that the plant I/O mode needs (C-M6-3, COM-025).
 *
 * `FramedSerialAdapter.plantBoardPort()` implements it; the board plant link (S2) consumes it. Entering the mode is a
 * physical operation (LNK-008, LNK-009): nothing here starts it by itself.
 */

import type { ENUMS } from '../../runtime/link/protocol.generated';

export type PlantExitReasonName = keyof typeof ENUMS.PLANT_EXIT_REASON;

/** One slot of the entry: an IPI byte offset for an input, an OPI byte offset for an output. `bit` is for BOOL only. */
export interface PlantSlotDescriptor {
  offset: number;
  type: 'BOOL' | 'INT' | 'REAL';
  bit?: number;
}

export interface PlantEnterRequest {
  timeoutMs: number;
  inputs: readonly PlantSlotDescriptor[];
  outputs: readonly PlantSlotDescriptor[];
}

export interface PlantEnterGrant {
  plantId: number;
  inBytes: number;
  outBytes: number;
  maxSlots: number;
  timeoutMs: number;
}

export interface PlantFrameResult {
  appliedSeq: number;
  scans: number;
  /** Bit 0: mirror on. Bit 1: the outputs were held since the last exchange. */
  flags: number;
  late: number;
  rejected: number;
  /** The output values, encoded as the input values are (bitmap, then INT and REAL values). */
  values: Uint8Array;
}

export interface PlantExitResult {
  reason: PlantExitReasonName;
  frames: number;
  late: number;
  rejected: number;
}

export interface PlantExitEvent {
  reason: PlantExitReasonName;
  frames: number;
}

export interface PlantBoardPort {
  /** True when the connected firmware speaks the framed link and advertises the PLANT capability (LNK-012). */
  supported(): boolean;
  enter(request: PlantEnterRequest): Promise<PlantEnterGrant>;
  /** `values` is the input encoding of C-M6-1: a BOOL bitmap, then INT and REAL values in descriptor order. */
  frame(plantId: number, seq: number, values: Uint8Array): Promise<PlantFrameResult>;
  exit(): Promise<PlantExitResult>;
  /** Returns the mirror state the device reports. */
  mirror(on: boolean): Promise<boolean>;
  /** The device ended the mode by itself (EVT_PLANT_EXIT); returns the unsubscribe function. */
  onExit(listener: (event: PlantExitEvent) => void): () => void;
}
