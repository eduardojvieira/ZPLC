/**
 * Assembly lines the code generator may emit (CMP-048)
 *
 * SPDX-License-Identifier: MIT
 *
 * The generator writes assembly text, and the assembler refuses a mnemonic that is not in the opcode table.
 * That refusal came late and only for the paths a program happened to take. Here the generator cannot write
 * such a mnemonic at all:
 *
 *  - `AsmLine` is a template literal type built from the mnemonics of the generated table, so a line that
 *    names `FOO`, or whose mnemonic is a plain `string`, does not type-check;
 *  - `emitLine` and `emitLines` check every line when it is written, which covers a line the type system
 *    sees only as a `string` (a routine read from a table, a label built at run time). The output buffer of the
 *    generator is an `AsmLine[]`, so nothing reaches it any other way.
 *
 * A mnemonic that is not in the table is a defect of the generator, never of the program being compiled, so it
 * is reported as an internal error that names the line and the mnemonic.
 */

import { Opcode } from '../contract.generated.ts';

/** The name of an instruction of the generated opcode table. */
export type Mnemonic = keyof typeof Opcode;

/**
 * One line of assembly text:
 * a blank line, a comment, a label (alone or with a comment after it), an instruction of the table with its
 * operand and an optional comment, or the `.TAG` directive the variable tags are written with.
 */
export type AsmLine =
    | ''
    | `;${string}`
    | `    ;${string}`
    | `${string}:`
    | `${string}: ${string}`
    | `    ${Mnemonic}`
    | `    ${Mnemonic} ${string}`
    | `.TAG ${string}`;

const MNEMONICS: ReadonlySet<string> = new Set(Object.keys(Opcode));

/** The directives the generator writes; the assembler accepts more, but nothing else here emits them. */
const DIRECTIVES: ReadonlySet<string> = new Set(['.TAG']);

/** What the assembler reads as a label: a name followed by a colon. */
const LABEL = /^[A-Za-z_][A-Za-z0-9_]*:/;

/**
 * Why `line` is not a line the generator may emit, or undefined when it is one. A label may be followed by an
 * instruction on the same line, as the assembler reads it.
 */
export function asmLineProblem(line: string): string | undefined {
    let text = line.trim();
    const label = LABEL.exec(text);
    if (label) text = text.slice(label[0].length).trim();
    if (text === '' || text.startsWith(';')) return undefined;
    const word = text.split(/\s+/, 1)[0]!;
    if (word.startsWith('.')) {
        return DIRECTIVES.has(word) ? undefined : `'${word}' is not a directive of the generator`;
    }
    return MNEMONICS.has(word) ? undefined : `'${word}' is not in the opcode table`;
}

/** An internal error: the generator wrote a line that is not in the contract. */
export class AsmEmissionError extends Error {
    constructor(
        readonly assemblyLine: string,
        problem: string,
    ) {
        super(`Internal compiler error: the code generator emitted \`${assemblyLine.trim()}\`: ${problem}`);
        this.name = 'AsmEmissionError';
    }
}

/** Write `line` to `output`; a line that is not in the contract is an error and nothing is written. */
export function emitLine(output: AsmLine[], line: AsmLine): void {
    const problem = asmLineProblem(line);
    if (problem !== undefined) throw new AsmEmissionError(line, problem);
    output.push(line);
}

/** Write each of `lines` to `output`; one that is not in the contract stops the build before any is written. */
export function emitLines(output: AsmLine[], lines: readonly AsmLine[]): void {
    for (const line of lines) {
        const problem = asmLineProblem(line);
        if (problem !== undefined) throw new AsmEmissionError(line, problem);
    }
    output.push(...lines);
}
