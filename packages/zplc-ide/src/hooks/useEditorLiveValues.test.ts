/**
 * @file useEditorLiveValues.test.ts
 * @brief Unit tests for the pure logic helpers in useEditorLiveValues.ts
 *
 * Tests cover:
 *   - buildLineToVarMap: line→var mapping from a DebugMap
 *   - getVarsInRange: viewport filtering
 *   - collectAllVarNames: flat extraction with cap
 *
 * No React / Monaco runtime is required — these are pure functions.
 */

import { describe, expect, it } from 'bun:test';
import type { DebugMap } from '../compiler';
import {
  buildLineToVarMap,
  collectAllVarNames,
  getVarsInRange,
} from './useEditorLiveValues';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal DebugMap with declarationLine set on every variable.
 *
 * pico_blinky-style layout:
 *   line 5  → Counter      (INT,  WORK, 0x2000)
 *   line 6  → SlowCounter  (INT,  WORK, 0x2002)
 *   line 7  → LED_State    (BOOL, WORK, 0x2004)
 *   line 8  → LED_Output   (BOOL, OPI,  0x1000)
 */
const MAP_WITH_LINES: DebugMap = {
  version: '1.0.0',
  programName: 'pico_blinky',
  compilerVersion: '1.5.0',
  generatedAt: '2026-03-16T00:00:00Z',
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Counter: {
          addr: 0x2000,
          type: 'INT',
          region: 'WORK',
          size: 2,
          declarationLine: 5,
        },
        SlowCounter: {
          addr: 0x2002,
          type: 'INT',
          region: 'WORK',
          size: 2,
          declarationLine: 6,
        },
        LED_State: {
          addr: 0x2004,
          type: 'BOOL',
          region: 'WORK',
          size: 1,
          declarationLine: 7,
        },
        LED_Output: {
          addr: 0x1000,
          type: 'BOOL',
          region: 'OPI',
          size: 1,
          declarationLine: 8,
        },
      },
      sourceMap: [],
      breakpoints: [],
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
    codeBase: 0x0000,
    codeSize: 128,
  },
};

/**
 * DebugMap where NO variable has a declarationLine set.
 * Simulates output from an older compiler build (pre Phase 4).
 */
const MAP_NO_LINES: DebugMap = {
  ...MAP_WITH_LINES,
  pou: {
    Main: {
      ...MAP_WITH_LINES.pou['Main'],
      vars: {
        Counter:     { addr: 0x2000, type: 'INT',  region: 'WORK', size: 2 },
        SlowCounter: { addr: 0x2002, type: 'INT',  region: 'WORK', size: 2 },
        LED_State:   { addr: 0x2004, type: 'BOOL', region: 'WORK', size: 1 },
        LED_Output:  { addr: 0x1000, type: 'BOOL', region: 'OPI',  size: 1 },
      },
    },
  },
};

/**
 * DebugMap where only some variables have declarationLine set.
 * Counter and LED_Output have lines; the others do not.
 */
const MAP_PARTIAL_LINES: DebugMap = {
  ...MAP_WITH_LINES,
  pou: {
    Main: {
      ...MAP_WITH_LINES.pou['Main'],
      vars: {
        Counter:     { addr: 0x2000, type: 'INT',  region: 'WORK', size: 2, declarationLine: 5 },
        SlowCounter: { addr: 0x2002, type: 'INT',  region: 'WORK', size: 2 },                   // no line
        LED_State:   { addr: 0x2004, type: 'BOOL', region: 'WORK', size: 1 },                   // no line
        LED_Output:  { addr: 0x1000, type: 'BOOL', region: 'OPI',  size: 1, declarationLine: 8 },
      },
    },
  },
};

/**
 * DebugMap with two POUs, each having variables on distinct lines.
 */
const MAP_TWO_POUS: DebugMap = {
  ...MAP_WITH_LINES,
  pou: {
    Main: {
      type: 'PROGRAM',
      entryPoint: 0,
      vars: {
        Counter: { addr: 0x2000, type: 'INT', region: 'WORK', size: 2, declarationLine: 3 },
      },
      sourceMap: [],
      breakpoints: [],
    },
    Timer: {
      type: 'FUNCTION_BLOCK',
      entryPoint: 64,
      vars: {
        Elapsed: { addr: 0x2010, type: 'TIME', region: 'WORK', size: 4, declarationLine: 20 },
        Done:    { addr: 0x2014, type: 'BOOL', region: 'WORK', size: 1, declarationLine: 21 },
      },
      sourceMap: [],
      breakpoints: [],
    },
  },
};

// ---------------------------------------------------------------------------
// buildLineToVarMap
// ---------------------------------------------------------------------------

describe('buildLineToVarMap', () => {
  it('builds a map from declaration line to variable name', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);

    expect(lineMap.get(5)).toEqual(['Counter']);
    expect(lineMap.get(6)).toEqual(['SlowCounter']);
    expect(lineMap.get(7)).toEqual(['LED_State']);
    expect(lineMap.get(8)).toEqual(['LED_Output']);
  });

  it('returns an empty map when no variable has a declarationLine', () => {
    const lineMap = buildLineToVarMap(MAP_NO_LINES);
    expect(lineMap.size).toBe(0);
  });

  it('only includes variables that have declarationLine set', () => {
    const lineMap = buildLineToVarMap(MAP_PARTIAL_LINES);
    expect(lineMap.size).toBe(2);
    expect(lineMap.get(5)).toEqual(['Counter']);
    expect(lineMap.get(8)).toEqual(['LED_Output']);
  });

  it('collects variables from multiple POUs', () => {
    const lineMap = buildLineToVarMap(MAP_TWO_POUS);
    expect(lineMap.get(3)).toEqual(['Counter']);
    expect(lineMap.get(20)).toEqual(['Elapsed']);
    expect(lineMap.get(21)).toEqual(['Done']);
    expect(lineMap.size).toBe(3);
  });

  it('handles two variables declared on the same line', () => {
    const map: DebugMap = {
      ...MAP_WITH_LINES,
      pou: {
        Main: {
          ...MAP_WITH_LINES.pou['Main'],
          vars: {
            A: { addr: 0x2000, type: 'INT',  region: 'WORK', size: 2, declarationLine: 10 },
            B: { addr: 0x2002, type: 'BOOL', region: 'WORK', size: 1, declarationLine: 10 },
          },
        },
      },
    };
    const lineMap = buildLineToVarMap(map);
    const vars = lineMap.get(10)!;
    expect(vars).toHaveLength(2);
    expect(vars).toContain('A');
    expect(vars).toContain('B');
  });
});

// ---------------------------------------------------------------------------
// collectAllVarNames
// ---------------------------------------------------------------------------

describe('collectAllVarNames', () => {
  it('collects all variable names from a single POU', () => {
    const names = collectAllVarNames(MAP_WITH_LINES);
    expect(names).toHaveLength(4);
    expect(names).toContain('Counter');
    expect(names).toContain('LED_Output');
  });

  it('collects variables across multiple POUs', () => {
    const names = collectAllVarNames(MAP_TWO_POUS);
    expect(names).toHaveLength(3);
    expect(names).toContain('Counter');
    expect(names).toContain('Elapsed');
    expect(names).toContain('Done');
  });

  it('respects the cap and stops collecting after cap is reached', () => {
    // Build a map with 10 vars
    const manyVars: Record<string, { addr: number; type: string; region: 'WORK'; size: number; declarationLine: number }> = {};
    for (let i = 0; i < 10; i++) {
      manyVars[`Var${i}`] = { addr: 0x2000 + i * 2, type: 'INT', region: 'WORK', size: 2, declarationLine: i + 1 };
    }
    const bigMap: DebugMap = {
      ...MAP_WITH_LINES,
      pou: { Main: { ...MAP_WITH_LINES.pou['Main'], vars: manyVars } },
    };

    const names = collectAllVarNames(bigMap, 5);
    expect(names).toHaveLength(5);
  });

  it('returns empty array for debug map with no vars', () => {
    const emptyMap: DebugMap = {
      ...MAP_WITH_LINES,
      pou: { Main: { ...MAP_WITH_LINES.pou['Main'], vars: {} } },
    };
    expect(collectAllVarNames(emptyMap)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getVarsInRange
// ---------------------------------------------------------------------------

describe('getVarsInRange', () => {
  it('returns only vars whose declarationLine is within the visible range', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);
    const allNames = collectAllVarNames(MAP_WITH_LINES);

    // Viewport shows lines 5–6 → Counter, SlowCounter
    const { visibleVars, unknownLineVars } = getVarsInRange(lineMap, allNames, 5, 6);

    expect(visibleVars).toHaveLength(2);
    expect(visibleVars).toContain('Counter');
    expect(visibleVars).toContain('SlowCounter');
    expect(unknownLineVars).toHaveLength(0);
  });

  it('returns empty visibleVars when viewport does not overlap any declaration', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);
    const allNames = collectAllVarNames(MAP_WITH_LINES);

    // Lines 1–4 have no declarations
    const { visibleVars } = getVarsInRange(lineMap, allNames, 1, 4);
    expect(visibleVars).toHaveLength(0);
  });

  it('returns all declared vars when viewport covers entire file', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);
    const allNames = collectAllVarNames(MAP_WITH_LINES);

    const { visibleVars, unknownLineVars } = getVarsInRange(lineMap, allNames, 1, 100);
    expect(visibleVars).toHaveLength(4);
    expect(unknownLineVars).toHaveLength(0);
  });

  it('reports vars without declarationLine as unknownLineVars', () => {
    const lineMap = buildLineToVarMap(MAP_PARTIAL_LINES); // only Counter@5 and LED_Output@8
    const allNames = collectAllVarNames(MAP_PARTIAL_LINES);

    // Viewport only shows line 5 (Counter visible), LED_Output not visible
    const { visibleVars, unknownLineVars } = getVarsInRange(lineMap, allNames, 5, 5);

    expect(visibleVars).toEqual(['Counter']);
    // SlowCounter and LED_State have no declarationLine → always returned as unknown
    expect(unknownLineVars).toHaveLength(2);
    expect(unknownLineVars).toContain('SlowCounter');
    expect(unknownLineVars).toContain('LED_State');
  });

  it('handles empty lineMap (all vars have no declarationLine)', () => {
    const lineMap = buildLineToVarMap(MAP_NO_LINES); // size = 0
    const allNames = collectAllVarNames(MAP_NO_LINES);

    const { visibleVars, unknownLineVars } = getVarsInRange(lineMap, allNames, 1, 50);
    expect(visibleVars).toHaveLength(0);
    // All 4 vars are unknownLineVars
    expect(unknownLineVars).toHaveLength(4);
  });

  it('handles single-line viewport exactly on a declaration line', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);
    const allNames = collectAllVarNames(MAP_WITH_LINES);

    const { visibleVars } = getVarsInRange(lineMap, allNames, 7, 7);
    expect(visibleVars).toEqual(['LED_State']);
  });

  it('includes vars from multiple POUs when viewport spans them', () => {
    const lineMap = buildLineToVarMap(MAP_TWO_POUS);
    const allNames = collectAllVarNames(MAP_TWO_POUS);

    // Lines 3 (Counter) and 20–21 (Elapsed, Done) — viewport 1–25 covers all
    const { visibleVars } = getVarsInRange(lineMap, allNames, 1, 25);
    expect(visibleVars).toHaveLength(3);
    expect(visibleVars).toContain('Counter');
    expect(visibleVars).toContain('Elapsed');
    expect(visibleVars).toContain('Done');
  });

  it('does not duplicate a var that appears on a line within the range', () => {
    const lineMap = buildLineToVarMap(MAP_WITH_LINES);
    const allNames = collectAllVarNames(MAP_WITH_LINES);

    const { visibleVars } = getVarsInRange(lineMap, allNames, 5, 8);
    const unique = new Set(visibleVars);
    expect(unique.size).toBe(visibleVars.length); // no duplicates
    expect(visibleVars).toHaveLength(4);
  });
});
