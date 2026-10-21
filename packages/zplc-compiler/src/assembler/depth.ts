/**
 * Evaluation-stack and call depth of the tasks of a program (CMP-050)
 *
 * SPDX-License-Identifier: MIT
 *
 * The compiler computes what the loader will prove: for each task entry, the most values its code holds on the
 * evaluation stack and the most call frames it has active at once. It reads the instructions the assembler
 * produced and the stack effect of each one from the generated opcode table, the table the loader's verifier
 * is generated from, so the two cannot disagree on what an instruction does; the conformance suite checks that
 * the numbers are the loader's on every artifact the compiler produces.
 *
 * The method is the verifier's. A subroutine ("frame") is the entry of a task or the target of a CALL. The depth
 * is an interval [lo, hi] relative to the depth where the frame was entered; paths that meet join their
 * intervals. A frame is summarised by what it takes from its caller's stack (need), the highest depth above its
 * entry that it reaches (peak), the change of depth over its returns (dlo, dhi) and how deep calls nest below it.
 * A call is then one instruction with that effect.
 */

import { OPCODE_TABLE, Opcode } from '../contract.generated';
import { getOperandSize } from './opcodes';
import type { Instruction } from './types';

/** An analysis that cannot give a depth: recursion, a stack that grows without bound, a task that underflows. */
export class DepthError extends Error {
    constructor(
        message: string,
        readonly address?: number,
    ) {
        super(message);
        this.name = 'DepthError';
    }
}

/** The depth of one task: its evaluation stack, and its call frames, the body of the task included. */
export interface TaskDepth {
    stack: number;
    frames: number;
}

interface Summary {
    /** Values the frame takes from the stack of its caller. */
    need: number;
    /** The highest depth above its entry that the frame reaches. */
    peak: number;
    /** The change of depth over its returns, joined; undefined when it never returns. */
    returns?: { lo: number; hi: number };
    /** How many calls nest below the frame. */
    nest: number;
}

/** A depth beyond what any program holds: a loop that grows the stack reaches it. */
const UNBOUNDED = 4096;
/** Nested calls followed before the analysis gives up: the call stack of the VM is shorter than this. */
const CALL_NEST_MAX = 256;

const BY_CODE = new Map(OPCODE_TABLE.map((entry) => [entry.code, entry]));

function hex(address: number): string {
    return `0x${address.toString(16).padStart(4, '0')}`;
}

/**
 * The depth of each task whose entry is in `entries`.
 *
 * @param instructions - the assembled instructions, with their addresses and resolved operands
 * @param entries - the entry address of each task
 * @throws DepthError when a depth cannot be given
 */
export function analyzeDepths(instructions: readonly Instruction[], entries: readonly number[]): TaskDepth[] {
    const at = new Map<number, Instruction>();
    for (const instruction of instructions) {
        if (!instruction.raw) at.set(instruction.address, instruction);
    }
    const summaries = new Map<number, Summary>();
    const active = new Set<number>();

    const summarize = (entry: number, nesting: number): Summary => {
        const known = summaries.get(entry);
        if (known) return known;
        if (active.has(entry)) throw new DepthError(`The code at ${hex(entry)} calls itself: a subroutine cannot be recursive`, entry);
        if (nesting > CALL_NEST_MAX) throw new DepthError(`Calls nest deeper than ${CALL_NEST_MAX} frames at ${hex(entry)}`, entry);
        active.add(entry);
        const summary = walk(entry, nesting);
        active.delete(entry);
        summaries.set(entry, summary);
        return summary;
    };

    const walk = (entry: number, nesting: number): Summary => {
        const depth = new Map<number, { lo: number; hi: number }>();
        const queue: number[] = [];
        let need = 0;
        let peak = 0;
        let nest = 0;
        let returns: { lo: number; hi: number } | undefined;

        const arrive = (address: number, lo: number, hi: number): void => {
            if (lo < -UNBOUNDED || hi > UNBOUNDED) {
                throw new DepthError(
                    `The evaluation stack grows without bound in the code at ${hex(address)}: a loop leaves more values on it at each turn`,
                    address,
                );
            }
            const known = depth.get(address);
            if (known === undefined) {
                depth.set(address, { lo, hi });
                queue.push(address);
                return;
            }
            if (lo >= known.lo && hi <= known.hi) return;
            known.lo = Math.min(known.lo, lo);
            known.hi = Math.max(known.hi, hi);
            queue.push(address);
        };

        arrive(entry, 0, 0);
        while (queue.length > 0) {
            const address = queue.pop()!;
            const instruction = at.get(address);
            if (!instruction) throw new DepthError(`The code at ${hex(address)} is not an instruction`, address);
            const info = BY_CODE.get(instruction.opcode);
            if (!info) throw new DepthError(`The instruction at ${hex(address)} is not in the opcode table`, address);
            let { lo, hi } = depth.get(address)!;
            const size = 1 + getOperandSize(instruction.opcode);

            // PICK n needs n + 1 values below it; the table states the one a plain instruction needs
            const minDepth = instruction.opcode === Opcode.PICK ? (instruction.operand ?? 0) + 1 : info.minDepth;
            if (minDepth > lo) need = Math.max(need, minDepth - lo);
            lo += info.pushes - info.pops;
            hi += info.pushes - info.pops;
            if (hi > peak) peak = hi;

            const target = info.flags.includes('relative')
                ? address + 2 + (((instruction.operand ?? 0) << 24) >> 24)
                : (instruction.operand ?? 0);
            switch (instruction.opcode) {
                case Opcode.HALT:
                    continue;
                case Opcode.RET:
                    returns = returns ? { lo: Math.min(returns.lo, lo), hi: Math.max(returns.hi, hi) } : { lo, hi };
                    continue;
                case Opcode.JMP:
                case Opcode.JR:
                    arrive(target, lo, hi);
                    continue;
                case Opcode.JZ:
                case Opcode.JNZ:
                case Opcode.JRZ:
                case Opcode.JRNZ:
                    arrive(target, lo, hi);
                    break;
                case Opcode.CALL: {
                    const callee = summarize(target, nesting + 1);
                    nest = Math.max(nest, callee.nest + 1);
                    if (callee.need > lo) need = Math.max(need, callee.need - lo);
                    if (hi + callee.peak > peak) peak = hi + callee.peak;
                    if (!callee.returns) continue; // a callee that never returns ends this path
                    lo += callee.returns.lo;
                    hi += callee.returns.hi;
                    break;
                }
                default:
                    break;
            }
            arrive(address + size, lo, hi);
        }
        return { need, peak, returns, nest };
    };

    return entries.map((entry) => {
        const summary = summarize(entry, 0);
        if (summary.need > 0) {
            throw new DepthError(
                `The code at ${hex(entry)} takes ${summary.need} value${summary.need === 1 ? '' : 's'} from an empty evaluation stack`,
                entry,
            );
        }
        return { stack: summary.peak, frames: summary.nest + 1 };
    });
}
