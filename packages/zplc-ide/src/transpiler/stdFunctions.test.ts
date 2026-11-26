import { describe, expect, it } from 'bun:test';
import { FUNCTION_DOCS, getAllFnNames } from '@zplc/compiler';

import { stdFunction, stdFunctions } from '../catalog/stdFunctions';

describe('LNG-029 the record of the standard functions', () => {
  it('covers exactly the functions the compiler registers', () => {
    expect([...stdFunctions().keys()].sort()).toEqual([...getAllFnNames()].sort());
    expect(stdFunctions().size).toBe(297);
  });

  it('reads the pins of a named function from the table and gives a conversion IN : FROM', () => {
    expect(stdFunction('LIMIT')).toMatchObject({
      inputs: [
        ['MN', 'ANY_NUM'],
        ['IN', 'ANY_NUM'],
        ['MX', 'ANY_NUM'],
      ],
      returns: 'ANY_NUM',
    });
    expect(stdFunction('MUX')).toMatchObject({
      variadic: true,
      inputs: [
        ['K', 'INT'],
        ['IN0', 'ANY'],
        ['IN1', 'ANY'],
      ],
    });
    expect(stdFunction('WATCHDOG_RESET')).toMatchObject({ inputs: [], returns: 'VOID' });
    expect(stdFunction('INT_TO_REAL')).toMatchObject({ inputs: [['IN', 'INT']], returns: 'REAL', category: 'conversion' });
  });

  it('knows the pins COPY and CLEAR write, as their reference text says', () => {
    expect(FUNCTION_DOCS.COPY!.en).toContain('into DST');
    expect(FUNCTION_DOCS.CLEAR!.en).toContain('Makes S the empty string');
    expect(stdFunction('COPY')!.written).toEqual(['DST']);
    expect(stdFunction('CLEAR')!.written).toEqual(['S']);
    const writers = [...stdFunctions().values()].filter((record) => record.written.length > 0).map((record) => record.name);
    expect(writers.sort()).toEqual(['CLEAR', 'COPY']);
  });

  it('knows the most inputs of MUX, as its reference text says, and of no other function', () => {
    expect(FUNCTION_DOCS.MUX!.en).toContain('up to eight inputs');
    expect(stdFunction('MUX')!.maxInputs).toBe(8);
    const bounded = [...stdFunctions().values()].filter((record) => record.maxInputs !== undefined).map((record) => record.name);
    expect(bounded).toEqual([...stdFunctions().values()].filter((record) => record.variadic).map((record) => record.name));
  });
});
