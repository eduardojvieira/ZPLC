/**
 * SFC (Sequential Function Chart) to Structured Text Transpiler
 * 
 * SPDX-License-Identifier: MIT
 * 
 * Re-exports the SFC transpiler from the transpiler module.
 * This file exists to satisfy the Phase 2.9 requirement for transpilers
 * to be located in ide/src/compiler/transpilers/.
 * 
 * @see ../../../transpiler/sfcToST.ts for the implementation
 */

export { transpileSFCToST } from '../../transpiler/sfcToST';
