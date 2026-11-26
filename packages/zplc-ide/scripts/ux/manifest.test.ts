import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { plan } from './capture';
import { captureName, captureRecord, conditionName, conditionsFor, manifestText, parseScreens, type Condition } from './manifest';
import type { Measurement } from './measurement';

const screens = readFileSync(new URL('../../../../specs/014-zplc-2-1-release-quality/screens.md', import.meta.url), 'utf8');
const surfaces = parseScreens(screens);
const base: Condition = { width: 1440, height: 900, theme: 'light', locale: 'en', density: 'comfortable' };

function fixture(): Measurement {
  return {
    viewport: { width: 1440, height: 900 },
    locale: 'es',
    elements: [
      {
        name: 'h2',
        parent: null,
        rect: { x: 10, y: 10, width: 100, height: 20 },
        scroll: { width: 100, height: 20 },
        client: { width: 100, height: 20 },
        overflowX: 'visible',
        overflowY: 'visible',
        textOverflow: 'clip',
        lineClamp: false,
        text: 'Open project',
        readable: false,
        color: [150, 150, 150, 1],
        background: [255, 255, 255, 1],
        fontSize: 13,
        fontWeight: 400,
        control: false,
        disabled: false,
        focusRing: null,
        inScroller: false,
        blocked: null,
      },
      {
        name: 'button[data-ld-toolbox-item]',
        parent: null,
        rect: { x: 350, y: 380, width: 80, height: 60 },
        scroll: { width: 80, height: 60 },
        client: { width: 80, height: 60 },
        overflowX: 'visible',
        overflowY: 'visible',
        textOverflow: 'clip',
        lineClamp: false,
        text: 'Hardware',
        readable: false,
        color: [0, 0, 0, 1],
        background: [255, 255, 255, 1],
        fontSize: 13,
        fontWeight: 400,
        control: true,
        disabled: false,
        focusRing: false,
        inScroller: false,
        blocked: 'covered',
      },
    ],
    textOutOfBox: ['spill: "Run" runs 12 px out of div'],
    scene: null,
  };
}

describe('the names and the manifest of a capture run (UXV-003)', () => {
  test('UXV-003 the surfaces, their areas and states are read from screens.md', () => {
    const welcome = surfaces.find((surface) => surface.id === 'shell.welcome');
    expect(welcome).toMatchObject({
      area: 'The shell',
      states: ['normal', 'with recent projects', 'a recent project that is gone', 'preferences shown'],
    });
    expect(surfaces.find((surface) => surface.id === 'dialog.palette')?.reachedBy).toEqual(['view.commandPalette']);
    expect(new Set(surfaces.map((surface) => surface.id)).size).toBe(surfaces.length);
    expect(surfaces.length).toBeGreaterThan(60);
  });

  test('UXV-003 a capture is named by surface, state and condition', () => {
    expect(conditionName(base)).toBe('1440x900-light-en');
    expect(conditionName({ ...base, width: 1024, height: 768, locale: 'es', density: 'compact' })).toBe('1024x768-light-es-compact');
    expect(captureName(surfaces, 'shell.welcome', 'with recent projects', base)).toBe(
      'shell.welcome--with-recent-projects--1440x900-light-en',
    );
    expect(() => captureName(surfaces, 'shell.nothing', 'normal', base)).toThrow('shell.nothing');
    expect(() => captureName(surfaces, 'shell.welcome', 'exploded', base)).toThrow('exploded');
  });

  test('UXV-003 every surface gets the covering set of conditions of D-36', () => {
    const names = conditionsFor(surfaces.find((surface) => surface.id === 'dialog.palette')!).map(conditionName);
    expect(names).toEqual([
      '1440x900-light-en',
      '1440x900-light-es',
      '1440x900-dark-en',
      '1440x900-dark-es',
      '1024x768-light-es',
      '1440x900-high-contrast-en',
      '1440x900-light-en-compact',
    ]);
  });

  test('UXV-003 two measurement runs over one page give byte-identical manifests', () => {
    const run = () =>
      manifestText(
        [captureRecord('shell.welcome--normal--1440x900-light-es', 'shell.welcome', 'normal', { ...base, locale: 'es' }, fixture())],
        [{ surface: 'installer.nsis', reason: 'outside Studio' }],
      );
    const first = run();
    expect(run()).toBe(first);
    const manifest = JSON.parse(first) as { captures: Array<{ file: string; defects: Array<{ kind: string }> }>; unreached: unknown[] };
    expect(manifest.captures[0]!.file).toBe('shell.welcome--normal--1440x900-light-es.png');
    expect(manifest.captures[0]!.defects.map((defect) => defect.kind).sort()).toEqual(['contrast', 'spill', 'wrong-language']);
    expect((manifest.captures[0] as unknown as { unchecked: unknown }).unchecked).toEqual([
      { where: 'button[data-ld-toolbox-item]', reason: 'covered' },
    ]);
    expect(manifest.unreached).toEqual([{ surface: 'installer.nsis', reason: 'outside Studio' }]);
  });

  test('UXV-003 the tool reaches every surface a safe command opens, and says why it cannot reach the others', () => {
    const { reached, unreached } = plan(surfaces);
    const by = new Map(reached.map((entry) => [entry.surface.id, entry]));
    expect(by.get('shell.welcome')).toMatchObject({ state: 'normal', command: null });
    expect(by.get('dialog.palette')).toMatchObject({ state: 'empty query', command: 'view.commandPalette' });
    expect(by.get('secondary.inspector')?.command).toBe('view.showInspector');
    for (const entry of reached) expect(entry.command ?? '').not.toMatch(/^(online|debug|learn)\.|^file\.closeProject$/);
    expect(unreached.find((entry) => entry.surface === 'installer.nsis')?.reason).toContain('outside Studio');
    expect(unreached.find((entry) => entry.surface === 'dialog.deploy')?.reason).toContain('online.deploy');
    expect(reached.length + unreached.length).toBe(surfaces.length);
  });
});
