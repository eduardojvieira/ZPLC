/**
 * Ladder bit-string initial values: BYTE, WORD, DWORD and LWORD local variables accept a decimal number, a based literal
 * (2#, 8#, 16#) or a typed literal of the same type, checked against the type's unsigned range and a strict literal pattern
 * before passing the text verbatim to the generated ST.
 */
import { describe, expect, it } from 'bun:test';

import { compileMultiTaskProject } from '../compiler';
import { transpileLDToST } from './ldToST';
import { coil, contact, ldFile, variable } from './ldFunctionFixture';
import type { LDVariable } from '../models/ld';

function ldWithLocal(localVar: LDVariable): Record<string, unknown> {
  return ldFile(
    { local: [variable('Start', 'BOOL'), variable('Lamp', 'BOOL'), localVar] },
    contact('c1', 'Start'),
    coil('k1', 'Lamp'),
  );
}

function build(content: Record<string, unknown>): string[] {
  try {
    compileMultiTaskProject(
      { name: 'P', version: '1.0.0', tasks: [{ name: 'Main', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main'] }] },
      [{ name: 'main', content: JSON.stringify(content), language: 'LD', sourceRef: 'src/main.ld.json' }],
    );
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}

describe('Ladder bit-string initial values', () => {
  it.each([
    // BYTE
    ['BYTE', 129, '129'],
    ['BYTE', '129', '129'],
    ['BYTE', '16#81', '16#81'],
    ['BYTE', '2#1010_0001', '2#1010_0001'],
    ['BYTE', '8#201', '8#201'],
    ['BYTE', 'BYTE#16#81', 'BYTE#16#81'],
    ['BYTE', 'BYTE#129', 'BYTE#129'],
    // WORD
    ['WORD', 1024, '1024'],
    ['WORD', '16#1234', '16#1234'],
    ['WORD', '2#1010_0101_0000_1111', '2#1010_0101_0000_1111'],
    ['WORD', '8#177777', '8#177777'],
    ['WORD', 'WORD#16#1234', 'WORD#16#1234'],
    ['WORD', 'WORD#65535', 'WORD#65535'],
    // DWORD
    ['DWORD', 305419896, '305419896'],
    ['DWORD', '16#1234_5678', '16#1234_5678'],
    ['DWORD', '2#1111_0000', '2#1111_0000'],
    ['DWORD', '8#37777777777', '8#37777777777'],
    ['DWORD', 'DWORD#16#FFFF_FFFF', 'DWORD#16#FFFF_FFFF'],
    ['DWORD', 'DWORD#4294967295', 'DWORD#4294967295'],
    // LWORD
    ['LWORD', 1000000, '1000000'],
    ['LWORD', '18446744073709551615', '18446744073709551615'],
    ['LWORD', '16#0123_4567_89AB_CDEF', '16#0123_4567_89AB_CDEF'],
    ['LWORD', '2#1010_0001', '2#1010_0001'],
    ['LWORD', '8#1777777777777777777777', '8#1777777777777777777777'],
    ['LWORD', 'LWORD#16#FFFF_FFFF_FFFF_FFFF', 'LWORD#16#FFFF_FFFF_FFFF_FFFF'],
    ['LWORD', 'LWORD#129', 'LWORD#129'],
  ] as const)('%s accepts %p verbatim and builds', (type, initialValue, expected) => {
    const content = ldWithLocal({ name: 'Mask', type, initialValue });
    const result = transpileLDToST(content);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(result.source).toContain(`    Mask : ${type} := ${expected};`);
    expect(build(content)).toEqual([]);
  });

  it.each([
    ['BYTE', 256, '0 to 255'],
    ['BYTE', -1, '0 to 255'],
    ['BYTE', 'BYTE#256', '0 to 255'],
    ['BYTE', '16#100', '0 to 255'],
    ['BYTE', '2#1_0000_0000', '0 to 255'],
    ['BYTE', '8#400', '0 to 255'],
    ['WORD', 65536, '0 to 65535'],
    ['WORD', 'WORD#65536', '0 to 65535'],
    ['WORD', '16#10000', '0 to 65535'],
    ['DWORD', 4294967296, '0 to 4294967295'],
    ['DWORD', 'DWORD#4294967296', '0 to 4294967295'],
    ['DWORD', '16#1_0000_0000', '0 to 4294967295'],
    ['LWORD', -1, '0 to 18446744073709551615'],
    ['LWORD', '18446744073709551616', '0 to 18446744073709551615'],
    ['LWORD', 'LWORD#18446744073709551616', '0 to 18446744073709551615'],
    ['LWORD', '16#1_0000_0000_0000_0000', '0 to 18446744073709551615'],
  ] as const)('refuses out-of-range %s initial value %p naming the variable and range', (type, initialValue, range) => {
    const result = transpileLDToST(ldWithLocal({ name: 'Mask', type, initialValue }));
    expect(result.success).toBe(false);
    expect(result.source).toBe('');
    expect(result.errors.some((message) => message.includes("'Mask'") && message.includes(range))).toBe(true);
  });

  it.each([
    ['injection after based literal', 'BYTE', '16#81; X := 1'],
    ['injection after typed literal', 'BYTE', 'BYTE#16#81; X := 1'],
    ['injection after decimal', 'WORD', '129; X := 1'],
    ['newline injection', 'DWORD', '16#81\nX := 1'],
    ['mismatched typed literal', 'BYTE', 'WORD#16#81'],
    ['invalid binary digit', 'BYTE', '2#102'],
    ['invalid octal digit', 'BYTE', '8#89'],
    ['unsupported base', 'BYTE', '10#12'],
    ['empty based digits', 'BYTE', '16#'],
    ['non-integer number', 'BYTE', 1.5],
    ['boolean value', 'BYTE', true],
  ] as const)('refuses %s (%s: %p) naming the variable', (_label, type, initialValue) => {
    const result = transpileLDToST(ldWithLocal({ name: 'Mask', type, initialValue }));
    expect(result.success).toBe(false);
    expect(result.source).toBe('');
    expect(result.errors.some((message) => message.includes("'Mask'"))).toBe(true);
  });

  it('keeps BOOL and INT initial value behaviour unchanged', () => {
    const valid = ldFile(
      {
        local: [
          { name: 'Start', type: 'BOOL', initialValue: true },
          { name: 'Lamp', type: 'BOOL', initialValue: false },
          { name: 'Count', type: 'INT', initialValue: -42 },
        ],
      },
      contact('c1', 'Start'),
      coil('k1', 'Lamp'),
    );
    const ok = transpileLDToST(valid);
    expect(ok.errors).toEqual([]);
    expect(ok.source).toContain('    Start : BOOL := TRUE;');
    expect(ok.source).toContain('    Lamp : BOOL := FALSE;');
    expect(ok.source).toContain('    Count : INT := -42;');
    expect(build(valid)).toEqual([]);

    const badBool = transpileLDToST(ldWithLocal({ name: 'Flag', type: 'BOOL', initialValue: 'oops' }));
    expect(badBool.success).toBe(false);
    expect(badBool.errors[0]).toContain("local variable 'Flag' initialValue must be BOOL");

    const badInt = transpileLDToST(ldWithLocal({ name: 'Count', type: 'INT', initialValue: 40000 }));
    expect(badInt.success).toBe(false);
    expect(badInt.errors[0]).toContain("local variable 'Count' initialValue is not representable as INT");
  });
});
