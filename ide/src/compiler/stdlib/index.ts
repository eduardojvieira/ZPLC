/**
 * ZPLC Standard Library - Registry
 *
 * SPDX-License-Identifier: MIT
 *
 * Central registry for all Function Blocks and Functions.
 * Provides lookup by name for the code generator.
 */

import type { FunctionBlockDef, FunctionDef } from './types.ts';

// Import all FB implementations
import { TON_FB, TOF_FB, TP_FB } from './timers.ts';
import { R_TRIG_FB, F_TRIG_FB, RS_FB, SR_FB } from './bistables.ts';
import { CTU_FB, CTD_FB, CTUD_FB } from './counters.ts';

// Import all Function implementations
import { MAX_FN, MIN_FN, LIMIT_FN, SEL_FN, MUX_FN } from './functions.ts';

// ============================================================================
// Function Block Registry
// ============================================================================

/**
 * Registry of all available Function Blocks.
 */
const functionBlocks = new Map<string, FunctionBlockDef>();

/**
 * Register a Function Block definition.
 */
export function registerFB(fb: FunctionBlockDef): void {
    functionBlocks.set(fb.name, fb);
}

/**
 * Get a Function Block by name.
 */
export function getFB(name: string): FunctionBlockDef | undefined {
    return functionBlocks.get(name);
}

/**
 * Check if a name is a registered Function Block.
 */
export function isFB(name: string): boolean {
    return functionBlocks.has(name);
}

/**
 * Get all registered Function Block names.
 */
export function getAllFBNames(): string[] {
    return Array.from(functionBlocks.keys());
}

// ============================================================================
// Function Registry
// ============================================================================

/**
 * Registry of all available Functions.
 */
const functions = new Map<string, FunctionDef>();

/**
 * Register a Function definition.
 */
export function registerFn(fn: FunctionDef): void {
    functions.set(fn.name, fn);
}

/**
 * Get a Function by name.
 */
export function getFn(name: string): FunctionDef | undefined {
    return functions.get(name);
}

/**
 * Check if a name is a registered Function.
 */
export function isFn(name: string): boolean {
    return functions.has(name);
}

/**
 * Get all registered Function names.
 */
export function getAllFnNames(): string[] {
    return Array.from(functions.keys());
}

// ============================================================================
// Initialize Registry
// ============================================================================

/**
 * Register all standard library blocks.
 * Called once at module load.
 */
function initRegistry(): void {
    // Timers
    registerFB(TON_FB);
    registerFB(TOF_FB);
    registerFB(TP_FB);

    // Edge detectors and bistables
    registerFB(R_TRIG_FB);
    registerFB(F_TRIG_FB);
    registerFB(RS_FB);
    registerFB(SR_FB);

    // Counters
    registerFB(CTU_FB);
    registerFB(CTD_FB);
    registerFB(CTUD_FB);

    // Functions
    registerFn(MAX_FN);
    registerFn(MIN_FN);
    registerFn(LIMIT_FN);
    registerFn(SEL_FN);
    registerFn(MUX_FN);
}

// Initialize on module load
initRegistry();

// ============================================================================
// Exports
// ============================================================================

export type { FunctionBlockDef, FunctionDef, CodeGenContext, MemberDef } from './types.ts';
export { formatAddr, getSizeSuffix, inputMember, outputMember, internalMember } from './types.ts';
