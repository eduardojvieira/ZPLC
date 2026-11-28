import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { isNever, markerOf, plan } from './capture';
import {
  captureName,
  captureRecord,
  conditionName,
  conditionsFor,
  lessonCaptureName,
  lessonConditions,
  lessonPlan,
  manifestText,
  parseScreens,
  type Condition,
} from './manifest';
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
        blocked: null,
        clip: { x: 0, y: 0, width: 1440, height: 900 },
        modal: false,
        field: null,
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
        blocked: 'covered',
        clip: { x: 0, y: 0, width: 1440, height: 900 },
        modal: false,
        field: null,
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

  test('UXV-003 the summary counts one defect per condition, selector and kind', () => {
    const at = (name: string, condition: Condition) => captureRecord(name, 'shell.welcome', 'normal', condition, fixture());
    const text = manifestText(
      [
        at('shell.welcome--normal--1440x900-light-en', base),
        at('shell.commandBar--idle--1440x900-light-en', base),
        at('shell.welcome--normal--1440x900-dark-en', { ...base, theme: 'dark' }),
      ],
      [],
    );
    const manifest = JSON.parse(text) as { defects: number; summary: { defects: number; byKind: Record<string, number> } };
    expect(manifest.defects).toBe(9);
    expect(manifest.summary).toEqual({ defects: 6, byKind: { contrast: 2, spill: 2, 'wrong-language': 2 } });
  });

  test('UXV-003 every surface the tool reaches has a marker that shows it is on screen, and the editors are reached', () => {
    const { reached, unreached } = plan(surfaces);
    for (const entry of reached)
      expect({ surface: entry.surface.id, marker: typeof markerOf(entry.surface.id, 'en') }).toEqual({
        surface: entry.surface.id,
        marker: 'string',
      });
    for (const id of ['editor.ld', 'editor.st', 'editor.il', 'editor.fbd', 'editor.sfc'])
      expect(reached.find((entry) => entry.surface.id === id)?.open).toBeTruthy();
    expect(unreached.find((entry) => entry.surface === 'dialog.importArchive')?.reason).toContain('Welcome');
  });
});

describe('the lessons of UXV-007', () => {
  const lessons = [
    { id: 'b', module: 1, order: 2, reading: true },
    { id: 'a', module: 1, order: 1, reading: false },
    { id: 'c', module: 0, order: 5, reading: true },
  ];

  test('UXV-007 every lesson is planned in course order, with a reading only when it has one, and an exercise always', () => {
    expect(lessonPlan(lessons).map((entry) => [entry.id, entry.kinds])).toEqual([
      ['c', ['reading', 'exercise']],
      ['a', ['exercise']],
      ['b', ['reading', 'exercise']],
    ]);
  });

  test('UXV-007 a capture is named lesson.<id>.<kind>--<condition>; readings also get the smallest window in Spanish', () => {
    expect(lessonCaptureName('ld-edges', 'reading', base)).toBe('lesson.ld-edges.reading--1440x900-light-en');
    expect(lessonConditions('reading').map(conditionName)).toEqual(['1440x900-light-en', '1440x900-light-es', '1024x768-light-es']);
    expect(lessonConditions('exercise').map(conditionName)).toEqual(['1440x900-light-en', '1440x900-light-es']);
  });
});

describe('what a capture must never run (AGENTS.md rule 8)', () => {
  test('UXV-007 opening a lesson is allowed; checking, running, saving, deploying, connecting and feeding a board are not', () => {
    for (const ok of ['learn.guide.next', 'learn.guide.back', 'view.showLearn', 'view.plant', 'view.guide'])
      expect({ ok, never: isNever(ok) }).toEqual({ ok, never: false });
    for (const bad of [
      'learn.check',
      'online.connect',
      'online.deploy',
      'online.feedBoardFromPlant',
      'plant.feedBoard',
      'debug.run',
      'debug.step',
      'file.save',
      'file.saveAll',
      'file.open',
      'file.export',
      'build.downloadProgram',
      'build.runAllTests',
    ])
      expect({ bad, never: isNever(bad) }).toEqual({ bad, never: true });
  });
});

describe('the surfaces that only lacked a way in', () => {
  test('UXV-003 the reading, its try-it, the Guide and the exercise are reached through a lesson, the operate panel through the plant', () => {
    const { reached, unreached } = plan(surfaces);
    const by = new Map(reached.map((entry) => [entry.surface.id, entry]));
    expect(by.get('learn.reading')?.lesson).toEqual({ id: 'ld-no-nc-contacts', stage: 'reading' });
    expect(by.get('learn.tryIt')?.lesson?.stage).toBe('reading');
    expect(by.get('learn.readingFrame')?.lesson?.stage).toBe('reading');
    expect(unreached.find((entry) => entry.surface === 'editor.plantMap')?.reason).toContain('marker');
    expect(by.get('secondary.guide')?.lesson?.stage).toBe('exercise');
    expect(by.get('learn.exercise')?.lesson?.stage).toBe('exercise');
    expect(by.get('plant.operate')?.command).toBe('view.plant');
    for (const entry of reached) expect(entry.surface.states).toContain(entry.state);
    for (const id of ['shell.toast', 'plant.faceplate', 'learn.result'])
      expect(unreached.find((entry) => entry.surface === id)?.reason.length).toBeGreaterThan(20);
  });
});
