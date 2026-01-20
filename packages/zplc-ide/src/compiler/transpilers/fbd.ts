/**
 * FBD (Function Block Diagram) to Structured Text Transpiler
 * 
 * SPDX-License-Identifier: MIT
 * 
 * Re-exports the FBD transpiler from the transpiler module.
 * This file exists to satisfy the Phase 2.9 requirement for transpilers
 * to be located in ide/src/compiler/transpilers/.
 * 
 * @see ../../../transpiler/fbdToST.ts for the implementation
 */

export { transpileFBDToST } from '../../transpiler/fbdToST';
