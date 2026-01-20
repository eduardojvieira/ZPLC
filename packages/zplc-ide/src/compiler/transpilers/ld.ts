/**
 * LD (Ladder Diagram) to Structured Text Transpiler
 * 
 * SPDX-License-Identifier: MIT
 * 
 * Re-exports the LD transpiler from the transpiler module.
 * This file exists to satisfy the Phase 2.9 requirement for transpilers
 * to be located in packages/zplc-ide/src/compiler/transpilers/.
 * 
 * @see ../../../transpiler/ldToST.ts for the implementation
 */

export { transpileLDToST } from '../../transpiler/ldToST';
