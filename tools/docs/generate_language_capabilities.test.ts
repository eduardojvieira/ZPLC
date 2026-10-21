import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CAPABILITIES, LANGUAGES, capabilityBlock, loadTable, outputs, unresolved, type CapabilityTable } from './generate_language_capabilities';
import { LANGS, ROOT } from './reference-lib';

describe('LNG-001 language capability table: one row per language and capability, from named tests', () => {
  const table = loadTable();

  it('names, for every cell, a journey of the ZPLC application that exists', () => {
    expect(unresolved(table)).toEqual([]);
  });

  it('refuses a cell whose journey does not exist', () => {
    const broken: CapabilityTable = structuredClone(table);
    broken.languages.st!.edit = { kind: 'journey', ref: '999 A journey nobody wrote' };
    expect(unresolved(broken)).toEqual(['st/edit: no journey named \'999 A journey nobody wrote\'']);
  });

  it('refuses a cell that is empty, board only, a unit test or a conformance case: none of them is end to end', () => {
    const weak: CapabilityTable = structuredClone(table);
    weak.languages.ld!.force = null;
    weak.languages.il!.deploy = { kind: 'board' };
    weak.languages.fbd!.build = { kind: 'test', ref: 'packages/zplc-ide/src/cli/blinkyVisualPosix.test.ts' };
    weak.languages.sfc!.simulate = { kind: 'conformance', ref: 'lng/lng-018-il-jump-runs-every-scan' };
    const problems = unresolved(weak);
    expect(problems).toHaveLength(4);
    expect(problems.join('\n')).toMatch(/ld\/force: no check/);
    expect(problems.join('\n')).toMatch(/il\/deploy: a 'board' check is not end to end/);
    expect(problems.join('\n')).toMatch(/fbd\/build: a 'test' check is not end to end/);
    expect(problems.join('\n')).toMatch(/sfc\/simulate: a 'conformance' check is not end to end/);
  });

  it('has a row for each of the five languages and each capability, in both languages of the site', () => {
    for (const lang of LANGS) {
      const rows = capabilityBlock(lang).split('\n').filter((line) => line.startsWith('| ') && !line.startsWith('| ---') && !line.includes('Capability') && !line.includes('Capacidad'));
      expect(rows).toHaveLength(LANGUAGES.length * CAPABILITIES.length);
    }
  });

  it('shows build, simulate and deploy of each language from one chain journey that also creates, edits, saves and reopens it, and says that the board is emulated', () => {
    for (const language of LANGUAGES) {
      const cells = [table.languages[language]!.build, table.languages[language]!.simulate, table.languages[language]!.deploy];
      expect(new Set(cells.map((cell) => JSON.stringify(cell))).size, `${language} chain`).toBe(1);
      expect(cells[0]).toMatchObject({ kind: 'journey', ref: expect.stringMatching(/^64[a-e] .* from a new project to a deployed program that is watched$/) });
    }
    const row = capabilityBlock('en').split('\n').find((line) => line.startsWith('| Ladder') && line.includes('Deploy'))!;
    expect(row).toContain('emulated board');
    expect(capabilityBlock('en')).not.toContain('Board only');
    expect(capabilityBlock('es')).toContain('placa emulada');
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
