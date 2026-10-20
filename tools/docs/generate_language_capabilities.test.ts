import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CAPABILITIES, LANGUAGES, capabilityBlock, loadTable, outputs, unresolved, type CapabilityTable } from './generate_language_capabilities';
import { LANGS, ROOT } from './reference-lib';

describe('LNG-001 language capability table: one row per language and capability, from named tests', () => {
  const table = loadTable();

  it('names a test, a journey or a conformance case that exists for every cell that is not a gap or a board-only one', () => {
    expect(unresolved(table)).toEqual([]);
  });

  it('refuses a cell whose journey, test file or conformance case does not exist', () => {
    const broken: CapabilityTable = structuredClone(table);
    broken.languages.st!.edit = { kind: 'journey', ref: '999 A journey nobody wrote' };
    broken.languages.il!.build = { kind: 'conformance', ref: 'lng/no-such-case' };
    broken.languages.ld!.build = { kind: 'test', ref: 'packages/zplc-ide/src/cli/blinkyVisualPosix.test.ts', contains: 'a describe that is not there' };
    expect(unresolved(broken)).toHaveLength(3);
  });

  it('has a row for each of the five languages and each capability, in both languages of the site', () => {
    for (const lang of LANGS) {
      const rows = capabilityBlock(lang).split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.includes('Capability') && !line.includes('Capacidad'));
      expect(rows).toHaveLength(LANGUAGES.length * CAPABILITIES.length);
    }
  });

  it('labels what only a board can show as board only, and an untested cell as not yet tested, never as working', () => {
    expect(capabilityBlock('en')).toContain('Board only');
    // the committed table may have no gap left: a gap is a null cell, and it is never drawn as evidence
    const gapped: CapabilityTable = structuredClone(table);
    gapped.languages.ld!.force = null;
    const row = capabilityBlock('en', gapped).split('\n').find((line) => line.startsWith('| Ladder') && line.includes('Force'))!;
    expect(row).toContain('Not tested end to end yet');
    expect(capabilityBlock('es', gapped)).toContain('Aún sin prueba de extremo a extremo');
  });

  it('LNG-027 names, for each of the five languages, a journey that pauses, steps one cycle and resumes in the native simulation, and a different one that stops at a breakpoint', () => {
    for (const language of LANGUAGES) {
      const pause = table.languages[language]!.pause;
      const debug = table.languages[language]!.debug;
      expect(pause, `${language} pause`).toMatchObject({ kind: 'journey', ref: expect.stringMatching(/^53[a-e] Pause, step one cycle and resume/) });
      expect(debug, `${language} debug`).toMatchObject({ kind: 'journey' });
      expect(debug).not.toEqual(pause);
    }
  });

  it('keeps the committed pages in step with the table (drift check)', () => {
    for (const { file, content } of outputs()) expect([file, readFileSync(`${ROOT}${file}`, 'utf8')]).toEqual([file, content]);
  });
});
