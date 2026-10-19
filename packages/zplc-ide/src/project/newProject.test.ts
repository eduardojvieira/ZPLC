// IDE-009: creating a project asks for a name, a target and the language of the first program, and makes a project that builds.
import { describe, expect, it } from 'bun:test';
import { compileProject } from '../compiler';
import { getExtensionForLanguage } from '../types';
import { resolveProgramSource } from '../utils/programSourceResolution';
import { NEW_PROJECT_LANGUAGES, SIMULATION_TARGET, newProjectConfig, newProjectProgram, newProjectTargets, validateProjectName } from './newProject';

describe('the first program of a new project (IDE-009)', () => {
  for (const language of NEW_PROJECT_LANGUAGES) {
    it(`is a ${language} program that builds`, () => {
      const { fileName, content } = newProjectProgram('Plant', language);
      expect(fileName).toBe(`main${getExtensionForLanguage(language)}`);
      expect(() => compileProject(content, language)).not.toThrow();
    });
  }
});

describe('the configuration of a new project (IDE-009)', () => {
  it('names the project, targets the board, and runs the first program in the main task', () => {
    const config = newProjectConfig('Plant', { target: 'rpi_pico', language: 'LD' });
    expect(config.name).toBe('Plant');
    expect(config.target?.board).toBe('rpi_pico');
    expect(config.tasks[0]?.programs).toEqual(['main.ld']);
  });
  for (const language of NEW_PROJECT_LANGUAGES) {
    it(`points the main task at a ${language} program that the build finds`, () => {
      const config = newProjectConfig('Plant', { target: SIMULATION_TARGET, language });
      const { fileName, content } = newProjectProgram('Plant', language);
      expect(resolveProgramSource(config.tasks[0]!.programs[0]!, [{ name: fileName, content, language }])).not.toBeNull();
    });
  }
  it('has no board for a simulation', () => {
    expect(newProjectConfig('Plant', { target: SIMULATION_TARGET, language: 'ST' }).target).toBeUndefined();
  });
  it('lists the simulation first and then the boards of the manifest', () => {
    const targets = newProjectTargets();
    expect(targets[0]?.value).toBe(SIMULATION_TARGET);
    expect(targets.length).toBeGreaterThan(1);
    expect(targets.some((entry) => entry.value === 'custom' || entry.value === '')).toBe(false);
  });
});

describe('the name of a new project (IDE-009)', () => {
  it('refuses an empty name, a name that is too long and a name with a path separator or a control character', () => {
    expect(validateProjectName('  ')).toBe('empty');
    expect(validateProjectName('x'.repeat(65))).toBe('long');
    expect(validateProjectName('a/b')).toBe('invalid');
    expect(validateProjectName('a\\b')).toBe('invalid');
    expect(validateProjectName('a\u0007b')).toBe('invalid');
  });
  it('accepts an ordinary name', () => {
    expect(validateProjectName('Packing line 2')).toBeNull();
  });
});
