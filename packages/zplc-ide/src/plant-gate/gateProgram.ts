import type { DebugMap } from '@zplc/compiler';

import { compileSingleFileWithTask } from '../compiler';

export const SCAN_MS = 10;
export const IO = {
  start: { address: 0x0000, bit: 0 },
  eye: { address: 0x0000, bit: 1 },
  belt: { address: 0x1000, bit: 0 },
} as const;

// Start latches the belt; 500 ms after the eye sees the box the belt stops. The timer makes the trace depend on the virtual clock.
export const GATE_PROGRAM_ST = `PROGRAM Main
VAR
  Start AT %IX0.0 : BOOL;
  Eye AT %IX0.1 : BOOL;
  Belt AT %QX0.0 : BOOL;
  Run : BOOL;
  Hold : TON;
END_VAR
IF Start THEN Run := TRUE; END_IF;
Hold(IN := Eye, PT := T#500ms);
IF Hold.Q THEN Run := FALSE; END_IF;
Belt := Run;
END_PROGRAM
`;

export const GATE_SOURCE_REF = 'src/main.st';

export function compileGateProgram(): { zplcFile: Uint8Array; debugMap: DebugMap } {
  const built = compileSingleFileWithTask(GATE_PROGRAM_ST, 'ST', { sourceRef: GATE_SOURCE_REF, programName: 'Main', intervalMs: SCAN_MS });
  return { zplcFile: built.zplcFile, debugMap: built.debugMap };
}

export const GRADED_HASH = 'd49abaf2985f0f641662ee9ef235094e4e98072319d977fcf58f24d99de462cb';
