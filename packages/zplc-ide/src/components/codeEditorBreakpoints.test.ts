import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'bun:test';

import { compilerCompile } from '../cli/toolApi';
import type { DebugMap } from '../compiler';
import {
  breakpointFileKey,
  doesCurrentPOUMatchFile,
  getBreakpointPCForLine,
  getEligibleBreakpointLines,
  isLineBreakpointEligible,
} from './codeEditorBreakpoints';

const DEBUG_MAP: DebugMap = {
  version: '1.0.0',
  programName: 'main',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {},
      sourceMap: [
        { line: 22, pc: 24, length: 2 },
        { line: 25, pc: 41, length: 3 },
      ],
      breakpoints: [
        { line: 22, pc: 24, valid: true },
        { line: 25, pc: 41, valid: true },
      ],
    },
  },
  memoryLayout: {
    ipiBase: 0x0000,
    ipiSize: 0x1000,
    opiBase: 0x1000,
    opiSize: 0x1000,
    workBase: 0x2000,
    workSize: 0x2000,
    retainBase: 0x4000,
    retainSize: 0x1000,
    codeBase: 0x5000,
    codeSize: 128,
  },
};

describe('isLineBreakpointEligible', () => {
  it('allows executable lines from the debug map', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'main.st', 22)).toBe(true);
  });

  it('rejects declaration lines that do not have executable breakpoint locations', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'main.st', 13)).toBe(false);
  });

  it('matches file names case-insensitively', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'MAIN.ST', 25)).toBe(true);
  });

  it('matches debug map keys that include file extensions', () => {
    const extensionMap: DebugMap = {
      ...DEBUG_MAP,
      pou: {
        'main.st': DEBUG_MAP.pou.main,
      },
    };

    expect(isLineBreakpointEligible(extensionMap, 'main.st', 22)).toBe(true);
    expect(getBreakpointPCForLine(extensionMap, 'main.st', 25)).toBe(41);
  });

  it('rejects unknown files and missing debug maps', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'other.st', 22)).toBe(false);
    expect(isLineBreakpointEligible(null, 'main.st', 22)).toBe(false);
  });

  it('returns sorted executable code lines only', () => {
    expect(getEligibleBreakpointLines(DEBUG_MAP, 'main.st')).toEqual([22, 25]);
  });

  it('maps an eligible line to its PC', () => {
    expect(getBreakpointPCForLine(DEBUG_MAP, 'main.st', 25)).toBe(41);
    expect(getBreakpointPCForLine(DEBUG_MAP, 'main.st', 13)).toBe(null);
  });
});

describe('sourceMap fallback', () => {
  const FALLBACK_MAP: DebugMap = {
    ...DEBUG_MAP,
    pou: {
      main: {
        ...DEBUG_MAP.pou.main,
        breakpoints: [],
        sourceMap: [
          { line: 24, pc: 29, length: 2 },
          { line: 27, pc: 46, length: 3 },
        ],
      },
    },
  };

  it('allows executable lines when explicit breakpoint metadata is absent', () => {
    expect(isLineBreakpointEligible(FALLBACK_MAP, 'main.st', 24)).toBe(true);
    expect(isLineBreakpointEligible(FALLBACK_MAP, 'main.st', 14)).toBe(false);
  });

  it('falls back to source-map PCs when needed', () => {
    expect(getBreakpointPCForLine(FALLBACK_MAP, 'main.st', 27)).toBe(46);
  });
});

describe('physical source references', () => {
  const physicalMap: DebugMap = {
    ...DEBUG_MAP,
    pou: {
      Main: {
        ...DEBUG_MAP.pou.main,
        sourceRef: 'main.ld',
      },
    },
  };

  it('uses sourceRef for breakpoints, including LD model aliases', () => {
    expect(isLineBreakpointEligible(physicalMap, 'main.ld.json', 22)).toBe(true);
    expect(getBreakpointPCForLine(physicalMap, 'main.ld', 25)).toBe(41);
    expect(isLineBreakpointEligible(physicalMap, 'main.st', 22)).toBe(false);
  });

  it('uses a semantic POU sourceRef for paused-line file matching', () => {
    expect(doesCurrentPOUMatchFile(physicalMap, 'Main', 'main.ld.json', 'editor-main-ld')).toBe(true);
    expect(doesCurrentPOUMatchFile(physicalMap, 'Main', 'main.st', 'editor-main-st')).toBe(false);
  });
});

describe('legacy debug maps without sourceRef', () => {
  // Fails without the base-name comparison in findPOU / normalizeBreakpointName: once the editor keys files by
  // project path, "src/main.st" must still find the POU "main".
  it('still match by POU name, for a bare file name and for a project-relative path', () => {
    expect(isLineBreakpointEligible(DEBUG_MAP, 'main.st', 22)).toBe(true);
    expect(isLineBreakpointEligible(DEBUG_MAP, 'src/main.st', 22)).toBe(true);
    expect(getBreakpointPCForLine(DEBUG_MAP, 'src/main.st', 25)).toBe(41);
    expect(getEligibleBreakpointLines(DEBUG_MAP, 'src\\main.st')).toEqual([22, 25]);
    expect(isLineBreakpointEligible(DEBUG_MAP, 'src/other.st', 22)).toBe(false);
    expect(doesCurrentPOUMatchFile(DEBUG_MAP, 'main', 'src/main.st', 'file:src/main.st')).toBe(true);
  });
});

describe('breakpointFileKey', () => {
  // Fails without the helper preferring path over name over file id (the key CodeEditor and the store must share).
  it('prefers the project path, then the name, then the file id', () => {
    expect(breakpointFileKey({ name: 'Motor.st', path: 'src/Motor.st' }, 'file:src/Motor.st')).toBe('src/Motor.st');
    expect(breakpointFileKey({ name: 'Motor.st', path: '' }, 'file:src/Motor.st')).toBe('Motor.st');
    expect(breakpointFileKey({ name: 'Motor.st' }, 'file:src/Motor.st')).toBe('Motor.st');
    expect(breakpointFileKey({ name: '', path: '' }, 'file:src/Motor.st')).toBe('file:src/Motor.st');
    expect(breakpointFileKey(undefined, 'file:src/Motor.st')).toBe('file:src/Motor.st');
  });
});

describe('breakpoint binding against the real compiler output of motor_start_stop', () => {
  const motorStartStop = fileURLToPath(new URL('../../projects/motor_start_stop', import.meta.url));
  // Motor.st executable lines and the PC the compiler assigns to each. The header comment of Motor.st and the comment above its first IF
  // shifted every line by 17; the PCs are the ones the program had before the comments.
  const PC_BY_LINE: Record<number, number> = { 37: 24, 38: 56, 39: 61, 41: 82, 43: 96, 46: 104, 47: 122 };
  const fileId = 'file:src/Motor.st';
  const editorKey = breakpointFileKey({ name: 'Motor.st', path: 'src/Motor.st' }, fileId);
  let motorMap: DebugMap;

  beforeAll(async () => {
    const built = await compilerCompile(motorStartStop);
    if (!built.ok || !built.debugMap) throw new Error('motor_start_stop did not compile');
    motorMap = built.debugMap;
  });

  // Guards the compiler/editor contract: fails if the compiler stops recording the project-relative sourceRef
  // (src/utils/programSourceResolution.ts, packages/zplc-compiler/src/compiler/index.ts) or loses a line's PC.
  it('records the project-relative path and a PC for every executable line', () => {
    const pou = motorMap.pou.Motor!;
    expect(pou.sourceRef).toBe('src/Motor.st');
    expect(Object.fromEntries(pou.breakpoints.map((entry) => [entry.line, entry.pc]))).toEqual(PC_BY_LINE);
  });

  // Fails without sourceRefMatchesFile comparing normalised project paths and the editor key being the path.
  it('makes exactly the executable lines eligible under the key the editor uses', () => {
    expect(getEligibleBreakpointLines(motorMap, editorKey)).toEqual([37, 38, 39, 41, 43, 46, 47]);
    for (let line = 1; line <= 50; line += 1) {
      expect(getBreakpointPCForLine(motorMap, editorKey, line)).toBe(PC_BY_LINE[line] ?? null);
      expect(isLineBreakpointEligible(motorMap, editorKey, line)).toBe(line in PC_BY_LINE);
    }
    expect(isLineBreakpointEligible(motorMap, editorKey, 19)).toBe(false); // VAR_INPUT declaration
    expect(getBreakpointPCForLine(motorMap, editorKey, 44)).toBeNull(); // END_IF
  });

  // Fails without sourceRefMatchesFile stripping "./", "file:" and backslashes before comparing.
  it('matches the same project file however its key is spelled, but not another folder', () => {
    for (const key of ['src/Motor.st', './src/Motor.st', 'src\\Motor.st', 'file:src/Motor.st', 'SRC/MOTOR.ST']) {
      expect(isLineBreakpointEligible(motorMap, key, 38)).toBe(true);
    }
    expect(isLineBreakpointEligible(motorMap, 'lib/Motor.st', 38)).toBe(false);
    const ladder: DebugMap = { ...DEBUG_MAP, pou: { Main: { ...DEBUG_MAP.pou.main, sourceRef: 'src/main.ld' } } };
    expect(isLineBreakpointEligible(ladder, 'src/main.ld.json', 22)).toBe(true);
  });

  // Fails without the editor key being the project path (or the file: prefix being ignored for the file id).
  it('highlights the paused line in the file the editor holds and in no other', () => {
    expect(doesCurrentPOUMatchFile(motorMap, 'Motor', editorKey, fileId)).toBe(true);
    const otherId = 'file:src/Other.st';
    const otherKey = breakpointFileKey({ name: 'Other.st', path: 'src/Other.st' }, otherId);
    expect(doesCurrentPOUMatchFile(motorMap, 'Motor', otherKey, otherId)).toBe(false);
  });
});
