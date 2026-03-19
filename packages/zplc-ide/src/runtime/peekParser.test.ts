import { describe, expect, it } from 'bun:test';

import {
  extractVariableBytes,
  groupVariablesForBatchPeek,
  parsePeekBytes,
  parseMpeekResponse,
  buildMpeekArgument,
} from './peekParser';
import type { WatchVariable } from './debugAdapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal WatchVariable for test purposes */
function makeVar(
  name: string,
  address: number,
  type: WatchVariable['type'],
): WatchVariable {
  return { name, address, type, forceable: false, value: undefined, maxLength: undefined, bitOffset: undefined };
}

// ---------------------------------------------------------------------------
// parsePeekBytes
// ---------------------------------------------------------------------------

describe('parsePeekBytes', () => {
  it('parses memory dump rows while ignoring headers and echoed commands', () => {
    const bytes = parsePeekBytes([
      'zplc dbg peek 0x2000 2',
      'Memory at 0x2000 (2 bytes):',
      '2000: 07 00',
    ], 2);

    expect(Array.from(bytes)).toEqual([0x07, 0x00]);
  });

  it('truncates extra bytes beyond requested length', () => {
    const bytes = parsePeekBytes([
      'Memory at 0x2000 (4 bytes):',
      '2000: 11 22 33 44 55 66',
    ], 4);

    expect(Array.from(bytes)).toEqual([0x11, 0x22, 0x33, 0x44]);
  });
});

// ---------------------------------------------------------------------------
// groupVariablesForBatchPeek
// ---------------------------------------------------------------------------

describe('groupVariablesForBatchPeek', () => {
  it('returns empty array for empty input', () => {
    expect(groupVariablesForBatchPeek([])).toEqual([]);
  });

  it('creates one group per variable when addresses are far apart', () => {
    // 0x1000 and 0x2000 are 4096 bytes apart — well beyond MAX_MERGE_GAP
    const vars = [
      makeVar('LED_Output', 0x1000, 'BOOL'),
      makeVar('Counter', 0x2000, 'INT'),
    ];

    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(2);
    expect(groups[0].baseAddress).toBe(0x1000);
    expect(groups[0].span).toBe(1);       // BOOL = 1 byte
    expect(groups[0].variables).toHaveLength(1);
    expect(groups[1].baseAddress).toBe(0x2000);
    expect(groups[1].span).toBe(2);       // INT = 2 bytes
    expect(groups[1].variables).toHaveLength(1);
  });

  it('merges adjacent variables into one group (pico_blinky WORK region)', () => {
    // pico_blinky layout: Counter(0x2000,INT=2), SlowCounter(0x2002,INT=2), LED_State(0x2004,BOOL=1)
    const vars = [
      makeVar('Counter', 0x2000, 'INT'),
      makeVar('SlowCounter', 0x2002, 'INT'),
      makeVar('LED_State', 0x2004, 'BOOL'),
    ];

    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(1);
    expect(groups[0].baseAddress).toBe(0x2000);
    expect(groups[0].span).toBe(5);       // from 0x2000 to end of 0x2004 (1 byte BOOL)
    expect(groups[0].variables).toHaveLength(3);
  });

  it('merges variables with a small gap (≤16 bytes) into one group', () => {
    // Gap of exactly 4 bytes between end of first var and start of second
    const vars = [
      makeVar('A', 0x1000, 'INT'),   // ends at 0x1002
      makeVar('B', 0x1006, 'INT'),   // starts at 0x1006 → gap = 4 bytes
    ];

    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(1);
    expect(groups[0].baseAddress).toBe(0x1000);
    expect(groups[0].span).toBe(8);  // 0x1008 - 0x1000
  });

  it('splits variables with a gap > 16 bytes into separate groups', () => {
    // Gap of 17 bytes between end of first var and start of second
    const vars = [
      makeVar('A', 0x1000, 'INT'),    // ends at 0x1002
      makeVar('B', 0x1013, 'BOOL'),   // starts at 0x1013 → gap = 17 bytes
    ];

    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(2);
  });

  it('sorts input variables by address before grouping', () => {
    // Provide in reverse order — result must be correctly ordered
    const vars = [
      makeVar('LED_State', 0x2004, 'BOOL'),
      makeVar('Counter', 0x2000, 'INT'),
      makeVar('SlowCounter', 0x2002, 'INT'),
    ];

    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(1);
    expect(groups[0].baseAddress).toBe(0x2000);
    // variables inside the group must also be sorted
    expect(groups[0].variables[0].name).toBe('Counter');
    expect(groups[0].variables[1].name).toBe('SlowCounter');
    expect(groups[0].variables[2].name).toBe('LED_State');
  });

  it('handles a single variable correctly', () => {
    const vars = [makeVar('X', 0x3000, 'DINT')];
    const groups = groupVariablesForBatchPeek(vars);

    expect(groups).toHaveLength(1);
    expect(groups[0].baseAddress).toBe(0x3000);
    expect(groups[0].span).toBe(4);  // DINT = 4 bytes
  });
});

// ---------------------------------------------------------------------------
// extractVariableBytes
// ---------------------------------------------------------------------------

describe('extractVariableBytes', () => {
  it('extracts bytes at offset 0 (first variable in buffer)', () => {
    // buffer holds Counter(2B) + SlowCounter(2B) + LED_State(1B) = [0x07,0x00,0x02,0x00,0x01]
    const buffer = new Uint8Array([0x07, 0x00, 0x02, 0x00, 0x01]);
    const counter = makeVar('Counter', 0x2000, 'INT');

    const bytes = extractVariableBytes(buffer, 0x2000, counter);

    expect(Array.from(bytes)).toEqual([0x07, 0x00]);
  });

  it('extracts bytes at a non-zero offset (middle variable in buffer)', () => {
    const buffer = new Uint8Array([0x07, 0x00, 0x02, 0x00, 0x01]);
    const slowCounter = makeVar('SlowCounter', 0x2002, 'INT');

    const bytes = extractVariableBytes(buffer, 0x2000, slowCounter);

    expect(Array.from(bytes)).toEqual([0x02, 0x00]);
  });

  it('extracts the last byte (BOOL at end of buffer)', () => {
    const buffer = new Uint8Array([0x07, 0x00, 0x02, 0x00, 0x01]);
    const ledState = makeVar('LED_State', 0x2004, 'BOOL');

    const bytes = extractVariableBytes(buffer, 0x2000, ledState);

    expect(Array.from(bytes)).toEqual([0x01]);
  });

  it('returns zero-filled array when variable is out of buffer range', () => {
    const buffer = new Uint8Array([0xAA, 0xBB]);
    const outOfRange = makeVar('X', 0x5000, 'INT');

    const bytes = extractVariableBytes(buffer, 0x2000, outOfRange);

    // Should return a 2-byte zero array instead of throwing
    expect(Array.from(bytes)).toEqual([0x00, 0x00]);
  });
});

// ---------------------------------------------------------------------------
// parseMpeekResponse
// ---------------------------------------------------------------------------

describe('parseMpeekResponse', () => {
  it('parses a well-formed single-line mpeek response', () => {
    const lines = ['{"t":"mpeek","results":[{"addr":8192,"bytes":"0700"}]}'];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(1);
    expect(Array.from(result.get(8192)!)).toEqual([0x07, 0x00]);
  });

  it('parses a multi-entry mpeek response (pico_blinky layout)', () => {
    // 0x2000=8192 Counter(2B), 0x2002=8194 SlowCounter(2B), 0x2004=8196 LED_State(1B)
    const lines = [
      '{"t":"mpeek","results":[',
      '{"addr":8192,"bytes":"0700"},',
      '{"addr":8194,"bytes":"1500"},',
      '{"addr":8196,"bytes":"01"}',
      ']}',
    ];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(3);
    expect(Array.from(result.get(8192)!)).toEqual([0x07, 0x00]);
    expect(Array.from(result.get(8194)!)).toEqual([0x15, 0x00]);
    expect(Array.from(result.get(8196)!)).toEqual([0x01]);
  });

  it('parses a response that has ANSI escape codes (terminal output)', () => {
    const lines = [
      '\x1B[1;32m{"t":"mpeek","results":[{"addr":4096,"bytes":"FF"}]}\x1B[0m',
    ];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(1);
    expect(Array.from(result.get(4096)!)).toEqual([0xff]);
  });

  it('returns empty Map on invalid JSON', () => {
    const lines = ['not-json-at-all'];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(0);
  });

  it('returns empty Map when type discriminant is wrong', () => {
    const lines = ['{"t":"peek","results":[{"addr":8192,"bytes":"07"}]}'];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(0);
  });

  it('returns empty Map for empty lines array', () => {
    const result = parseMpeekResponse([]);
    expect(result.size).toBe(0);
  });

  it('skips malformed result entries but still parses the good ones', () => {
    const lines = [
      '{"t":"mpeek","results":[{"addr":8192,"bytes":"0700"},{"bad":true}]}',
    ];
    const result = parseMpeekResponse(lines);

    // Only the valid entry should be in the map
    expect(result.size).toBe(1);
    expect(Array.from(result.get(8192)!)).toEqual([0x07, 0x00]);
  });

  it('filters out uart:~$ shell prompt lines', () => {
    const lines = [
      'uart:~$ zplc dbg mpeek 0x2000:2',
      '{"t":"mpeek","results":[{"addr":8192,"bytes":"AABB"}]}',
      'uart:~$',
    ];
    const result = parseMpeekResponse(lines);

    expect(result.size).toBe(1);
    expect(Array.from(result.get(8192)!)).toEqual([0xaa, 0xbb]);
  });
});

// ---------------------------------------------------------------------------
// buildMpeekArgument
// ---------------------------------------------------------------------------

describe('buildMpeekArgument', () => {
  it('builds a single-entry argument string', () => {
    expect(buildMpeekArgument([{ address: 0x2000, size: 2 }])).toBe('0x2000:2');
  });

  it('builds a multi-entry argument string', () => {
    const result = buildMpeekArgument([
      { address: 0x2000, size: 2 },
      { address: 0x2002, size: 2 },
      { address: 0x2004, size: 1 },
    ]);
    expect(result).toBe('0x2000:2,0x2002:2,0x2004:1');
  });

  it('returns empty string for empty requests', () => {
    expect(buildMpeekArgument([])).toBe('');
  });
});
