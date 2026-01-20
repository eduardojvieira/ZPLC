/**
 * IL (Instruction List) to Structured Text Transpiler
 *
 * SPDX-License-Identifier: MIT
 *
 * Re-exports the IL transpiler from the IL compiler module.
 * This file exists to maintain consistency with other transpilers
 * (LD, FBD, SFC) located in ide/src/compiler/transpilers/.
 *
 * @see ../il/ilToST.ts for the implementation
 */

export { transpileILToST } from '../il/ilToST';
