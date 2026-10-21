import { describe, expect, it } from 'bun:test';

import { getAllFBNames, getAllFnNames } from '../../packages/zplc-compiler/src/compiler/stdlib/index.ts';
import { CONVERSION_TYPES, conversionResultType } from '../../packages/zplc-compiler/src/compiler/stdlib/conversions.ts';
import { BLOCK_DOCS, FUNCTION_DOCS } from '../../packages/zplc-compiler/src/compiler/stdlib/reference.ts';
import { blocksBody, conversionExample, exampleFence, functionsBody, registryErrors } from './generate_function_reference';
import { extractSamples } from './check-docs-samples';

const headings = (text: string) => [...text.matchAll(/^### (\S+)$/gm)].map((match) => match[1]!);

describe('function reference: a registered name has an entry (DOC-007)', () => {
  it('finds no missing entry and no entry that names nothing in the repository', () => {
    expect(registryErrors()).toEqual([]);
  });

  it('fails for a registered function without an entry', () => {
    const { MAX: _removed, ...rest } = FUNCTION_DOCS;
    expect(registryErrors(rest)).toEqual(['function MAX is registered and has no entry in stdlib/reference.ts']);
  });

  it('fails for a registered block without an entry, and for an entry that names nothing', () => {
    const { TON: _removed, ...rest } = BLOCK_DOCS;
    expect(registryErrors(FUNCTION_DOCS, rest)).toEqual(['function block TON is registered and has no entry in stdlib/reference.ts']);
    expect(registryErrors({ ...FUNCTION_DOCS, NO_SUCH_FUNCTION: FUNCTION_DOCS.MAX! })).toEqual([
      'stdlib/reference.ts documents the function NO_SUCH_FUNCTION, which is not registered',
    ]);
  });
});

describe('function reference: the pages list every name, in both languages (DOC-007)', () => {
  it('lists every registered function and every type conversion', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = functionsBody(lang);
      const listed = new Set(headings(text));
      for (const name of getAllFnNames()) {
        if (conversionResultType(name) === undefined) expect([name, listed.has(name)]).toEqual([name, true]);
        else expect([name, text.includes(`\`${name}\``)]).toEqual([name, true]);
      }
    }
  });

  it('lists every registered function block with a pin table', () => {
    for (const lang of ['en', 'es'] as const) {
      const text = blocksBody(lang);
      const listed = new Set(headings(text));
      for (const name of getAllFBNames()) expect([name, listed.has(name)]).toEqual([name, true]);
    }
  });

  it('has the same headings and the same number of examples in English and in Spanish', () => {
    expect(headings(functionsBody('es'))).toEqual(headings(functionsBody('en')));
    expect(headings(blocksBody('es'))).toEqual(headings(blocksBody('en')));
    const count = (text: string) => extractSamples('p.md', text).samples.length;
    expect(count(functionsBody('es'))).toBe(count(functionsBody('en')));
  });

  it('gives each example as a runnable sample that states its result', () => {
    const { samples, errors } = extractSamples(
      'p.md',
      exampleFence({ source: 'VAR\n    A : INT;\nEND_VAR\n\nA := 1;', expect: 'A=1', scans: 3 }),
    );
    expect(errors).toEqual([]);
    expect(samples.map((sample) => [sample.expected, sample.scans])).toEqual([[[{ name: 'A', value: 1 }], 3]]);
  });
});

describe('function reference: the conversions are proven for every pair (DOC-007)', () => {
  it('calls every conversion of a source type in the program of that type', () => {
    for (const from of CONVERSION_TYPES) {
      const example = conversionExample(from);
      for (const to of CONVERSION_TYPES)
        if (to !== from) expect([from, to, example.source.includes(`${from}_TO_${to}(Source)`)]).toEqual([from, to, true]);
    }
  });
});
