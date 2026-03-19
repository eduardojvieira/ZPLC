/**
 * Visual Language Transpilers
 * 
 * SPDX-License-Identifier: MIT
 * 
 * This module provides transpilers that convert visual PLC languages
 * (LD, FBD, SFC) and Instruction List (IL) to IEC 61131-3 Structured Text,
 * enabling them to use the existing ST compiler pipeline.
 * 
 * Transpile Strategy:
 * - LD (Ladder Diagram): Rungs → Boolean expressions, Coils → Assignments
 * - FBD (Function Block Diagram): Topological sort → Execution order
 * - SFC (Sequential Function Chart): State machine → CASE/IF logic
 * - IL (Instruction List): Accumulator ops → CR variable + state machine for jumps
 */

export { transpileLDToST } from './ld';
export { transpileFBDToST } from './fbd';
export { transpileSFCToST } from './sfc';
export { transpileILToST } from './il';

export const TRANSPILED_LANGUAGE = {
  IL: 'IL',
  LD: 'LD',
  FBD: 'FBD',
  SFC: 'SFC',
} as const;

export function supportsTranspileWorkflow(language: string): boolean {
  return Object.values(TRANSPILED_LANGUAGE).includes(
    language as (typeof TRANSPILED_LANGUAGE)[keyof typeof TRANSPILED_LANGUAGE]
  );
}
