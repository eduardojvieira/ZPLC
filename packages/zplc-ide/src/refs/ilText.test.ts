import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { ilOccurrences } from './ilText';

const SOURCE = [
  'PROGRAM Blinky', //1
  'VAR', //2
  '    OffTimer : TON;', //3
  'END_VAR', //4
  'VAR_OUTPUT', //5
  '    LED_Output AT %Q0.0 : BOOL;', //6
  'END_VAR', //7
  '(* LD Hidden *)', //8
  '        LDN     LED_Output ; LD Ignored', //9
  '        ST      OffTimer.IN', //10
  '        CAL     OffTimer(', //11
  '                    PT := T#500ms', //12
  '                )', //13
  'END_PROGRAM',
].join('\n');

describe('ilText', () => {
  test('FND-004 an IL operand is a reference and a comment is not', () => {
    const found = ilOccurrences('src/main.il', SOURCE);
    const names = found.filter((o) => o.role !== 'declaration' && o.role !== 'binding').map((o) => o.text);
    expect(names).toEqual(['LED_Output', 'OffTimer', 'OffTimer']);
    expect(names).not.toContain('Hidden');
    expect(names).not.toContain('Ignored');
    expect(names).not.toContain('PT');
    expect(found.every((o) => o.language === 'IL')).toBe(true);
    expect(found.find((o) => o.text === 'OffTimer' && o.role === 'write')).toBeDefined();
  });

  test('FND-004 an IL declaration with AT is a declaration occurrence with its address', () => {
    const found = ilOccurrences('src/main.il', SOURCE);
    expect(found.filter((o) => o.role === 'declaration').map((o) => o.text)).toEqual(['OffTimer', 'LED_Output']);
    const led = found.find((o) => o.text === 'LED_Output' && o.role === 'declaration')!;
    expect(led.place).toEqual({ kind: 'text', file: 'src/main.il', line: 6, column: 5, length: 10 });
    const binding = found.find((o) => o.role === 'binding')!;
    expect(binding.text).toBe('%Q0.0');
    expect(binding.place).toEqual({ kind: 'text', file: 'src/main.il', line: 6, column: 19, length: 5 });
  });

  test('FND-003 an IL occurrence names its line element', () => {
    const found = ilOccurrences('src/main.il', SOURCE);
    const use = found.find((o) => o.text === 'LED_Output' && o.role === 'use')!;
    expect(use.place).toMatchObject({ kind: 'element', file: 'src/main.il', element: 'line:9' });
    const call = found.find((o) => o.text === 'OffTimer' && o.place.kind === 'element' && o.place.element === 'line:11');
    expect(call?.role).toBe('use');
  });

  test('FND-004 the bundled Blinky IL file yields its declarations and operands', () => {
    const text = readFileSync(new URL('../../projects/blinky_il/src/main.il', import.meta.url), 'utf8');
    const found = ilOccurrences('src/main.il', text);
    expect(found.filter((o) => o.role === 'declaration').map((o) => o.text)).toEqual(['OffTimer', 'OnTimer', 'LED_Output']);
    expect(found.filter((o) => o.text === 'LED_Output' && o.role !== 'declaration').length).toBe(4);
  });
});
