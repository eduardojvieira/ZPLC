import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, mock } from 'bun:test';

import type { DebugMap } from '../compiler';

// The hook module imports the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
}));
const { describeBreakpointHit } = await import('./useDebugController');

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'Main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-10-09T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {},
      sourceMap: [
        { pc: 0x60, line: 7, column: 1, length: 4 },
        { pc: 0x68, line: 9, column: 1, length: 4 },
      ],
      breakpoints: [{ line: 9, pc: 0x68, valid: true }],
    },
  },
  memoryLayout: {
    ipiBase: 0,
    ipiSize: 0x1000,
    opiBase: 0x1000,
    opiSize: 0x1000,
    workBase: 0x2000,
    workSize: 0x2000,
    retainBase: 0x4000,
    retainSize: 0x1000,
    codeBase: 0,
    codeSize: 128,
  },
};

/** LX-2b: the real-app run wrote "Breakpoint hit at PC=0x68" with no line, though the editor highlighted line 9. */
describe('the Console entry for a breakpoint hit', () => {
  // The native, WASM and serial adapters all call onBreakpointHit(pc) with no line, so the line has to come from the debug map.
  // Fails while the entry prints only the line the adapter passes (hooks/useDebugController.ts): it ended at "PC=0x68".
  it('carries the line the debug map gives for the pc, when the adapter passes none', () => {
    const { resolved, message } = describeBreakpointHit(DEBUG_MAP, 0x68);
    expect(message).toBe('Breakpoint hit at PC=0x68, line 9');
    expect(resolved).toEqual({ line: 9, pc: 0x68, pouName: 'Main' });
  });

  it('names the same line the editor highlights, also when the adapter passes a different one', () => {
    const { resolved, message } = describeBreakpointHit(DEBUG_MAP, 0x60, 4);
    expect(resolved.line).toBe(7);
    expect(message).toBe('Breakpoint hit at PC=0x60, line 7');
  });

  // The real-app journey 7 matches this prefix.
  it('keeps the prefix "Breakpoint hit at PC=0x" and writes the pc in upper-case hex', () => {
    const { message } = describeBreakpointHit(
      { ...DEBUG_MAP, pou: { Main: { ...DEBUG_MAP.pou.Main, sourceMap: [{ pc: 0xab, line: 3, column: 1, length: 2 }] } } },
      0xab,
    );
    expect(message.startsWith('Breakpoint hit at PC=0x')).toBe(true);
    expect(message).toBe('Breakpoint hit at PC=0xAB, line 3');
  });

  it('falls back to the adapter line without a map, and to the pc alone when nothing knows the line', () => {
    expect(describeBreakpointHit(null, 0x68, 12).message).toBe('Breakpoint hit at PC=0x68, line 12');
    expect(describeBreakpointHit(null, 0x68).message).toBe('Breakpoint hit at PC=0x68');
    expect(describeBreakpointHit(DEBUG_MAP, 0x70).message).toBe('Breakpoint hit at PC=0x70');
    expect(describeBreakpointHit(DEBUG_MAP, 0x70).resolved).toEqual({ line: null, pc: 0x70, pouName: null });
  });

  it('is what the adapter event handler writes and highlights from', () => {
    const source = readFileSync(join(import.meta.dir, 'useDebugController.ts'), 'utf8');
    const handler = source.slice(source.indexOf('onBreakpointHit: (pc: number, line?: number)'), source.indexOf('onStepComplete:'));

    expect(handler).toContain('describeBreakpointHit(debugMap, pc, line)');
    expect(handler).toContain('setCurrentExecution(resolved.pouName, resolved.line, resolved.pc)');
    expect(handler).toContain('message,');
    expect(handler).not.toContain('Breakpoint hit at');
  });
});
