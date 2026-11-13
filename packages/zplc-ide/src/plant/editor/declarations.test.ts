import { describe, expect, it } from 'bun:test';
import { compileProject } from '../../compiler';
import { newProjectProgram } from '../../project/newProject';
import type { PlantSignalDef } from '../contracts';
import { declarationsFor, generateDeclarations, type DeclarationLanguage } from './declarations';

const SCENE: PlantSignalDef[] = [
  { name: 'Belt1.run', direction: 'command', type: 'BOOL' },
  { name: 'Eye1.seen', direction: 'sensor', type: 'BOOL' },
  { name: 'Tank1.level', direction: 'sensor', type: 'REAL', unit: 'L' },
  { name: 'Count1.value', direction: 'command', type: 'INT' },
];
const LANGUAGES: DeclarationLanguage[] = ['ST', 'LD', 'FBD', 'SFC', 'IL'];

describe('declarations of a scene (SCN-013)', () => {
  it('SCN-013 ST output is unchanged byte for byte', () => {
    expect(generateDeclarations(SCENE, 'st')).toBe(
      [
        '  VAR_INPUT',
        '    Eye1_seen : BOOL;',
        '    Tank1_level : REAL; (* L *)',
        '  END_VAR',
        '  VAR_OUTPUT',
        '    Belt1_run : BOOL;',
        '    Count1_value : INT;',
        '  END_VAR',
        '',
      ].join('\n'),
    );
    const st = declarationsFor(SCENE, 'ST');
    expect(st).toEqual({ kind: 'text', language: 'ST', block: generateDeclarations(SCENE, 'st') });
  });

  it('SCN-013 each language returns the variables of the scene, inputs for sensors and outputs for commands', () => {
    for (const language of LANGUAGES) {
      const d = declarationsFor(SCENE, language);
      expect(d.language).toBe(language);
      if (d.kind === 'text') {
        expect(['ST', 'IL']).toContain(language);
        expect(d.block).toContain('VAR_INPUT\n    Eye1_seen : BOOL;');
        expect(d.block).toContain('VAR_OUTPUT\n    Belt1_run : BOOL;');
      } else {
        expect(['LD', 'FBD', 'SFC']).toContain(language);
        expect(d.rows.map((r) => [r.name, r.direction])).toEqual([
          ['Belt1_run', 'output'],
          ['Eye1_seen', 'input'],
          ['Tank1_level', 'input'],
          ['Count1_value', 'output'],
        ]);
      }
    }
  });

  it('SCN-013 a REAL and an INT signal keep their type in every language', () => {
    for (const language of LANGUAGES) {
      const d = declarationsFor(SCENE, language);
      if (d.kind === 'text') {
        expect(d.block).toContain('Tank1_level : REAL;');
        expect(d.block).toContain('Count1_value : INT;');
      } else {
        expect(d.rows.find((r) => r.name === 'Tank1_level')?.type).toBe('REAL');
        expect(d.rows.find((r) => r.name === 'Count1_value')?.type).toBe('INT');
      }
    }
  });

  it('SCN-013 no AT address is chosen, and the signals the caller holds are not changed', () => {
    const before = JSON.stringify(SCENE);
    for (const language of LANGUAGES) {
      const d = declarationsFor(SCENE, language);
      const text = d.kind === 'text' ? d.block : JSON.stringify(d.rows);
      expect(text).not.toMatch(/\bAT\b|%[IQM]|address/);
    }
    expect(JSON.stringify(SCENE)).toBe(before);
  });

  it('LNK-002 a name collision gets a numeric suffix in every language', () => {
    const clash: PlantSignalDef[] = [
      { name: 'a.b', direction: 'sensor', type: 'BOOL' },
      { name: 'a_b', direction: 'sensor', type: 'BOOL' },
      { name: 'A_B', direction: 'command', type: 'BOOL' },
    ];
    for (const language of LANGUAGES) {
      const d = declarationsFor(clash, language);
      const names = d.kind === 'text' ? [...d.block.matchAll(/^ {4}(\w+) :/gm)].map((m) => m[1]) : d.rows.map((r) => r.name);
      expect(names.sort()).toEqual(['A_B_3', 'a_b', 'a_b_2']);
    }
  });

  // A declaration is only worth having if the project's compiler takes it.
  for (const language of LANGUAGES) {
    it(`SCN-013 the ${language} declarations compile with the project's compiler`, () => {
      const d = declarationsFor(SCENE, language);
      let source: string;
      if (d.kind === 'text') {
        const body = language === 'IL' ? '  LD Eye1_seen\n  ST Belt1_run\n' : '  Belt1_run := Eye1_seen;\n';
        source = `PROGRAM Scene\n${d.block}${body}END_PROGRAM\n`;
      } else {
        const doc = JSON.parse(newProjectProgram('P', language).content);
        const row = (r: (typeof d.rows)[number]) => ({ name: r.name, type: r.type, comment: r.comment });
        doc.variables = {
          ...doc.variables,
          inputs: d.rows.filter((r) => r.direction === 'input').map(row),
          outputs: d.rows.filter((r) => r.direction === 'output').map(row),
        };
        source = JSON.stringify(doc);
      }
      expect(() => compileProject(source, language)).not.toThrow();
    });
  }
});
