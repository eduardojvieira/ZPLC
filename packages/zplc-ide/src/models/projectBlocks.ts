/**
 * The function blocks and functions a project declares, as blocks the visual languages place (LNG-008)
 *
 * SPDX-License-Identifier: MIT
 *
 * The standard blocks of the palette come from the compiler registry. The ones the project writes itself, in any
 * Structured Text file of it, are read from the declarations: a function block has its inputs (VAR_INPUT and
 * VAR_IN_OUT) and its outputs (VAR_OUTPUT) as ports, and a function has its inputs and one output, OUT, its
 * result. The FBD and LD transpilers call them with named arguments, so the ports are the names the declaration
 * gives, in the order it gives them.
 */

import { parse } from '@zplc/compiler';
import type { CompilationUnit, VarDecl } from '@zplc/compiler';

export interface ProjectBlockPort {
  name: string;
  type: string;
}

export interface ProjectBlock {
  /** The name as the file declares it; names are matched without regard to case. */
  name: string;
  kind: 'FUNCTION_BLOCK' | 'FUNCTION';
  /** The inputs in the order of the declaration: VAR_INPUT, then VAR_IN_OUT. */
  inputs: ProjectBlockPort[];
  /** The outputs of a function block; a function has OUT, its result. */
  outputs: ProjectBlockPort[];
  /** The file that declares it. */
  source: string;
}

/** A source file as the project holds it: only the Structured Text files declare blocks. */
export interface ProjectSourceFile {
  name: string;
  path?: string;
  content: string;
  language: string;
}

function typeText(type: unknown): string {
  if (typeof type === 'string') return type;
  if (typeof type === 'object' && type !== null) {
    const shape = type as { kind?: string };
    if (shape.kind === 'PointerType') return `REF_TO ${typeText((type as { baseType: unknown }).baseType)}`;
    if (shape.kind === 'ArrayType') {
      const array = type as unknown as { dimensions: Array<{ lowerBound: number; upperBound: number }>; elementType: unknown };
      return `ARRAY[${array.dimensions.map((d) => `${d.lowerBound}..${d.upperBound}`).join(', ')}] OF ${typeText(array.elementType)}`;
    }
  }
  return 'ANY';
}

const port = (declaration: VarDecl): ProjectBlockPort => ({ name: declaration.name, type: typeText(declaration.dataType) });

/** The blocks that one parsed file declares. */
export function blocksOfUnit(unit: CompilationUnit, source: string): ProjectBlock[] {
  return [
    ...unit.functionBlocks.map((block): ProjectBlock => ({
      name: block.name,
      kind: 'FUNCTION_BLOCK',
      inputs: [...block.inputs, ...block.inouts].map(port),
      outputs: block.outputs.map(port),
      source,
    })),
    ...unit.functions.map((fn): ProjectBlock => ({
      name: fn.name,
      kind: 'FUNCTION',
      inputs: fn.inputs.map(port),
      outputs: [{ name: 'OUT', type: typeText(fn.returnType) }],
      source,
    })),
  ];
}

/**
 * The blocks of every Structured Text file of the project, the first declaration of a name winning. A file that
 * does not parse contributes none: its diagnostics come from the build.
 */
export function collectProjectBlocks(files: Iterable<ProjectSourceFile>): ProjectBlock[] {
  const blocks = new Map<string, ProjectBlock>();
  for (const file of files) {
    if (file.language !== 'ST') continue;
    let unit: CompilationUnit;
    try {
      unit = parse(file.content);
    } catch {
      continue;
    }
    for (const block of blocksOfUnit(unit, file.path ?? file.name)) {
      const key = block.name.toUpperCase();
      if (!blocks.has(key)) blocks.set(key, block);
    }
  }
  return [...blocks.values()].sort((first, second) => (first.name.toUpperCase() < second.name.toUpperCase() ? -1 : 1));
}

/** The block of this name, when the project declares one. */
export function findProjectBlock(blocks: readonly ProjectBlock[] | undefined, name: string): ProjectBlock | undefined {
  const key = name.toUpperCase();
  return blocks?.find((block) => block.name.toUpperCase() === key);
}

/** The palette category of the blocks the project declares, or none when it declares none (LNG-008). */
export function projectPalette(blocks: readonly ProjectBlock[]): { name: string; blocks: string[] } | undefined {
  return blocks.length === 0 ? undefined : { name: 'Project', blocks: blocks.map((block) => block.name) };
}

/** What a palette shows when the pointer rests on a block of the project: its kind, inputs and outputs. */
export function describeProjectBlock(block: ProjectBlock): string {
  const ports = (list: ProjectBlockPort[]) => list.map((port) => `${port.name}: ${port.type}`).join(', ') || '-';
  return `${block.kind === 'FUNCTION' ? 'FUNCTION' : 'FUNCTION_BLOCK'} ${block.name} (${block.source})\nIN: ${ports(block.inputs)}\nOUT: ${ports(block.outputs)}`;
}
