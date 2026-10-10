import { describe, expect, it } from 'bun:test';

import { extractSamples, parityErrors, parseExpected, parseInfo, programOf, type Sample } from './check-docs-samples';

// The fixtures are built from parts so that this file holds no fence of its own.
const FENCE = '`'.repeat(3);
const block = (info: string, ...body: string[]) => [`${FENCE}${info}`.trimEnd(), ...body, FENCE].join('\n');
const PAGE = 'docs/docs/languages/x.md';

describe('docs samples: the fence convention (VF-020)', () => {
  it('reads the language, the flags and the quoted attributes of an info string', () => {
    const { language, attributes } = parseInfo('st runnable expect="Out1=TRUE %QW0=5" scans=30 scan_ms=10');
    expect(language).toBe('st');
    expect(Object.fromEntries(attributes)).toEqual({ runnable: '', expect: 'Out1=TRUE %QW0=5', scans: '30', scan_ms: '10' });
  });

  it('finds the runnable blocks of a page with the line of their fence, and nothing else', () => {
    const text = ['# Page', '', block('st runnable', 'PROGRAM A', 'END_PROGRAM'), '', block('c', 'int x;'), '', block('st', 'PROGRAM B', 'END_PROGRAM')].join('\n');
    const { samples, unmarked, errors } = extractSamples(PAGE, text);
    expect(errors).toEqual([]);
    expect(samples.map((sample) => [sample.line, sample.source, sample.language])).toEqual([[3, 'PROGRAM A\nEND_PROGRAM', 'st']]);
    expect(unmarked).toEqual([{ page: PAGE, line: 12, info: 'st' }]);
  });

  it('reads the expected result, the scan count and the scan period', () => {
    const text = block('st runnable expect="Out1=TRUE Count:DINT=7 %QW0=5" scans=30 scan_ms=20', 'PROGRAM A', 'END_PROGRAM');
    const [sample] = extractSamples(PAGE, text).samples;
    expect(sample!.expected).toEqual([{ name: 'Out1', value: true }, { name: 'Count', type: 'DINT', value: 7 }, { name: '%QW0', value: 5 }]);
    expect([sample!.scans, sample!.scanMs]).toEqual([30, 20]);
  });

  it('accepts an iecst or pascal fence as Structured Text and language=il as Instruction List', () => {
    const text = [block('iecst runnable', 'PROGRAM A', 'END_PROGRAM'), block('pascal runnable', 'PROGRAM B', 'END_PROGRAM'), block('iecst runnable language=il', 'PROGRAM C', 'END_PROGRAM')].join('\n\n');
    expect(extractSamples(PAGE, text).samples.map((sample) => sample.language)).toEqual(['st', 'st', 'il']);
  });

  it('wraps a fragment in a program and leaves a whole program alone', () => {
    expect(programOf({ source: 'x := 1;', fragment: true })).toBe('PROGRAM DocSample\nx := 1;\nEND_PROGRAM\n');
    expect(programOf({ source: 'PROGRAM A\nEND_PROGRAM', fragment: false })).toBe('PROGRAM A\nEND_PROGRAM');
  });

  it('keeps a block inside a list item, indented, and finds its closing fence', () => {
    const text = ['1. Step', '', `   ${FENCE}st runnable`, '   PROGRAM A', '   END_PROGRAM', `   ${FENCE}`, '', 'Done.'].join('\n');
    const { samples, errors } = extractSamples(PAGE, text);
    expect(errors).toEqual([]);
    expect(samples[0]!.source).toBe('PROGRAM A\nEND_PROGRAM');
  });

  it('names a malformed mark instead of ignoring it', () => {
    const cases: Array<[string, string]> = [
      [block('c runnable', 'int x;'), 'runnable needs an st, iecst or pascal fence'],
      [block('st runnable expect="Out1"', 'PROGRAM A', 'END_PROGRAM'), 'must look like Name=Value'],
      [block('st runnable expect="Out1=maybe"', 'PROGRAM A', 'END_PROGRAM'), 'neither TRUE, FALSE nor a number'],
      [block('st runnable expect="X:FLOAT=1"', 'PROGRAM A', 'END_PROGRAM'), 'is not a type'],
      [block('st runnable scans=0 expect="X=1"', 'PROGRAM A', 'END_PROGRAM'), 'scans must be an integer'],
      [block('st runnable scans=5', 'PROGRAM A', 'END_PROGRAM'), 'only mean something with expect'],
      [block('st runnable colour=red', 'PROGRAM A', 'END_PROGRAM'), 'unknown fence attribute "colour"'],
      [`${FENCE}st runnable\nPROGRAM A`, 'is never closed'],
    ];
    for (const [text, message] of cases) expect(extractSamples(PAGE, text).errors.join('\n')).toContain(message);
  });
});

describe('docs samples: expected results (VF-020)', () => {
  it('accepts TRUE and FALSE in either case, integers, negative numbers and reals', () => {
    const { expected, errors } = parseExpected('a=TRUE b=false c=-3 d=2.5 %QX0.1=1', 'x');
    expect(errors).toEqual([]);
    expect(expected.map((entry) => entry.value)).toEqual([true, false, -3, 2.5, 1]);
  });
});

describe('docs samples: the English page and its Spanish twin (VF-020)', () => {
  const sample = (page: string, over: Partial<Sample> = {}): Sample => ({
    page, line: 1, language: 'st', fragment: false, source: 'PROGRAM A\nEND_PROGRAM', expected: [{ name: 'Out1', value: true }], scans: 30, scanMs: 10, ...over,
  });

  it('is satisfied when both pages mark the same samples the same way', () => {
    expect(parityErrors(new Map([['a.md', [sample('en')]]]), new Map([['a.md', [sample('es')]]]))).toEqual([]);
  });

  it('names a page whose twin marks fewer or more samples', () => {
    expect(parityErrors(new Map([['a.md', [sample('en')]]]), new Map()).join('\n')).toContain('has 1 runnable sample(s) and its Spanish page has 0');
    expect(parityErrors(new Map(), new Map([['a.md', [sample('es')]]])).join('\n')).toContain('no English page does');
  });

  it('names samples whose expected result, scans or language differ', () => {
    const english = new Map([['a.md', [sample('en')]]]);
    for (const over of [{ expected: [{ name: 'Out1', value: false }] }, { scans: 31 }, { language: 'il' as const }]) {
      expect(parityErrors(english, new Map([['a.md', [sample('es', over)]]])).join('\n')).toContain('are marked differently');
    }
  });
});
