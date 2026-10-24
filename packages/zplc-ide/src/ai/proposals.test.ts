import { describe, expect, test } from 'bun:test';
import { COMMANDS } from '../commands/registry';
import { LANGUAGE_SETTINGS } from '../i18n/locale';
import { DENSITY_CHOICES, FONT_SIZE_RANGE, TAB_SIZE_CHOICES } from '../utils/appSettings';
import { isSourceElementId } from '../models/sourceElements';
import {
  AI_COMMAND_PROPOSALS,
  AI_PROPOSAL_CAP,
  AI_PROPOSABLE_SETTINGS,
  AI_THEME_CHOICES,
  AI_LANGUAGE_CHOICES,
  AI_DENSITY_CHOICES,
  AI_TAB_SIZE_CHOICES,
  AI_FONT_SIZE_RANGE,
  parseProposals,
} from './proposals';

describe('what an assistant may propose besides a change set (S6, S7)', () => {
  test('no command it can propose is physical, a download or the hardware mode, whatever the registry holds', () => {
    const proposable: string[] = Object.values(AI_COMMAND_PROPOSALS);
    expect(proposable.sort()).toEqual(['build.compile', 'build.generateSt', 'online.simulation']);
    for (const command of COMMANDS as readonly { id: string; physical?: boolean }[]) {
      if (command.physical) expect(proposable, command.id).not.toContain(command.id);
    }
    expect(proposable).not.toContain('build.downloadProgram');
    expect(proposable).not.toContain('online.hardware');
    const ids = new Set(COMMANDS.map((command) => command.id as string));
    for (const id of proposable) expect(ids.has(id), id).toBe(true);
    for (const command of COMMANDS as readonly { id: string; physical?: boolean }[])
      if (proposable.includes(command.id)) expect(command.physical ?? false, command.id).toBe(false);
  });

  test('its lists of setting values are the ones of the application, and the sensitive settings are not among the settings', () => {
    expect([...AI_LANGUAGE_CHOICES]).toEqual([...LANGUAGE_SETTINGS]);
    expect([...AI_DENSITY_CHOICES]).toEqual([...DENSITY_CHOICES]);
    expect([...AI_TAB_SIZE_CHOICES]).toEqual([...TAB_SIZE_CHOICES]);
    expect(AI_FONT_SIZE_RANGE).toEqual(FONT_SIZE_RANGE);
    expect([...AI_THEME_CHOICES]).toEqual(['light', 'dark', 'high-contrast', 'system']);
    expect([...AI_PROPOSABLE_SETTINGS].sort()).toEqual(['density', 'editorFontSize', 'editorTabSize', 'language', 'theme']);
    for (const name of ['autosaveSeconds', 'checkForUpdates', 'unlockAllLessons', 'hideSolutions', 'provider', 'apiKey', 'endpoint'])
      expect(AI_PROPOSABLE_SETTINGS as readonly string[]).not.toContain(name);
  });

  test('its element ids are element ids of the application', () => {
    for (const [file, id] of [
      ['A.ld.json', 'rung:rung_1'],
      ['A.fbd.json', 'block:and_1'],
      ['A.sfc.json', 'step:S0'],
      ['A.sfc.json', 'transition:t1'],
    ] as const) {
      expect(isSourceElementId(id)).toBe(true);
      expect(parseProposals([{ type: 'selectElement', path: `src/${file}`, element: id }])).not.toBeNull();
    }
  });

  test('takes each proposal in its exact form and nothing else', () => {
    const good: unknown[] = [
      { type: 'openFile', path: 'src/Main.st' },
      { type: 'goToLine', path: 'src/Main.il', line: 12 },
      { type: 'selectElement', path: 'src/Lamp.ld.json', element: 'rung:r1' },
      { type: 'compile' },
      { type: 'generateSt' },
      { type: 'startSimulation' },
      { type: 'setting', name: 'theme', value: 'dark' },
      { type: 'setting', name: 'language', value: 'es' },
      { type: 'setting', name: 'density', value: 'compact' },
      { type: 'setting', name: 'editorFontSize', value: 16 },
      { type: 'setting', name: 'editorTabSize', value: 2 },
    ];
    expect(parseProposals(good.slice(0, AI_PROPOSAL_CAP))).toEqual(good.slice(0, AI_PROPOSAL_CAP) as never);
    expect(parseProposals(good.slice(AI_PROPOSAL_CAP))).toEqual(good.slice(AI_PROPOSAL_CAP) as never);
    expect(parseProposals(undefined)).toEqual([]);
  });

  test('refuses a proposal for anything physical, any other setting, a malformed value, or too many', () => {
    const bad: unknown[] = [
      { type: 'deploy' },
      { type: 'run' },
      { type: 'command', id: 'online.deploy' },
      { type: 'command', id: 'build.downloadProgram' },
      { type: 'compile', id: 'debug.run' },
      { type: 'hardware' },
      { type: 'setting', name: 'autosaveSeconds', value: 5 },
      { type: 'setting', name: 'checkForUpdates', value: true },
      { type: 'setting', name: 'unlockAllLessons', value: true },
      { type: 'setting', name: 'hideSolutions', value: true },
      { type: 'setting', name: 'endpoint', value: 'https://evil.test' },
      { type: 'setting', name: 'theme', value: 'neon' },
      { type: 'setting', name: 'language', value: 'fr' },
      { type: 'setting', name: 'density', value: 'huge' },
      { type: 'setting', name: 'editorFontSize', value: 9 },
      { type: 'setting', name: 'editorFontSize', value: 33 },
      { type: 'setting', name: 'editorFontSize', value: 12.5 },
      { type: 'setting', name: 'editorTabSize', value: 5 },
      { type: 'setting', name: 'theme', value: 'dark', extra: 1 },
      { type: 'openFile', path: 'zplc.json' },
      { type: 'openFile', path: 'src/../x.st' },
      { type: 'openFile', path: '/etc/passwd' },
      { type: 'openFile', path: 'src/Main.st', extra: 1 },
      { type: 'goToLine', path: 'src/Main.st', line: 0 },
      { type: 'goToLine', path: 'src/Main.st', line: 1.5 },
      { type: 'goToLine', path: 'src/Main.st', line: 1_000_001 },
      { type: 'selectElement', path: 'src/Main.st', element: 'rung:r1' },
      { type: 'selectElement', path: 'src/A.ld.json', element: 'line:3' },
      { type: 'selectElement', path: 'src/A.ld.json', element: 'rung:a/b' },
      { type: 'selectElement', path: 'src/A.ld.json', element: `rung:${'x'.repeat(300)}` },
      'compile',
      null,
    ];
    for (const item of bad) expect(parseProposals([item]), JSON.stringify(item)).toBeNull();
    expect(parseProposals(Array.from({ length: AI_PROPOSAL_CAP + 1 }, () => ({ type: 'compile' })))).toBeNull();
    expect(parseProposals({ type: 'compile' })).toBeNull();
    expect(parseProposals(new Array(1))).toBeNull();
    expect(parseProposals([])).toBeNull();
  });
});
