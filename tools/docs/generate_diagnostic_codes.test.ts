import { describe, expect, it } from 'bun:test';

import { ERROR_CODES } from '../../packages/zplc-compiler/src/compiler/error-codes.ts';
import { ERROR_EXAMPLES } from '../../packages/zplc-compiler/src/compiler/error-examples.ts';
import { PAGES, diagnosticCodesBody } from './generate_diagnostic_codes';
import { LANGS, renderPage } from './reference-lib';

describe('CMP-006 diagnostic code reference: generated from the registry of the compiler', () => {
  it('lists every code in both languages, each with its sentence, and the example of each code that a program provokes', () => {
    for (const lang of LANGS) {
      const body = diagnosticCodesBody(lang);
      for (const name of ERROR_CODES) {
        expect([lang, name, body.includes(`| \`${name}\` |`)]).toEqual([lang, name, true]);
        expect([lang, name, body.includes(`### ${name}`)]).toEqual([lang, name, true]);
        const example = ERROR_EXAMPLES[name];
        if (example !== undefined) expect([lang, name, body.includes(`\`${example.line}:${example.column}\``)]).toEqual([lang, name, true]);
      }
    }
  });

  it('has the same headings in English and in Spanish', () => {
    const levels = (text: string) => [...text.matchAll(/^(#{2,6}) /gm)].map((match) => match[1]!.length);
    expect(levels(diagnosticCodesBody('es'))).toEqual(levels(diagnosticCodesBody('en')));
  });

  it('states the over-size failures, which name the bytes required, the bytes available and the largest consumers (CMP-043)', () => {
    for (const lang of LANGS) {
      const body = diagnosticCodesBody(lang);
      for (const name of ['WORK_MEMORY_EXCEEDED', 'RETAIN_MEMORY_EXCEEDED', 'CODE_MEMORY_EXCEEDED']) expect(body).toContain(`- \`${name}\``);
    }
    expect(diagnosticCodesBody('en')).toContain('bytes required');
  });

  it('writes the page whole, with the markers that say it is generated', () => {
    const page = PAGES[0]!;
    for (const lang of LANGS) {
      const text = renderPage('tools/docs/generate_diagnostic_codes.ts', page, lang);
      expect(text).toContain('GENERATED (tools/docs/generate_diagnostic_codes.ts)');
      expect(text).toContain('tags: [reference, generated]');
    }
  });
});
