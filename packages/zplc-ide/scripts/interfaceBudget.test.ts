import { describe, expect, it } from 'bun:test';
import {
  checkBudget,
  checkMeasures,
  commandBarCounts,
  measure,
  resultsTabCounts,
  statusRailItems,
  targetPlaces,
  type BudgetTargets,
  type InterfaceSnapshot,
  type LocaleMeasures,
  type ProductMeasures,
} from './interfaceBudget';

/** A stored snapshot of the 2.0.0 running state at 1366 by 768, shortened: the shape the capture in the page produces. */
const control = (label: string, x: number, width = 30) => ({ label, x, width });
const snapshot: InterfaceSnapshot = {
  locale: 'en',
  viewport: { width: 1366, height: 768 },
  state: 'running',
  commandBar: {
    projectNameX: 852,
    controls: [
      control('Save active file (Ctrl+S)', 105, 34),
      control('Build options', 152, 87),
      control('Where the run goes: Simulation', 252, 88),
      control('Disconnect', 446, 105),
      control('Pause (F6)', 624, 75),
      control('More commands', 0, 0),
      control('Inspector (Ctrl+Alt+I)', 1209, 32),
      control('Theme options', 1292, 28),
    ],
  },
  tabStrip: { left: 382, right: 1328 },
  resultsTabs: [
    { id: 'output', name: 'Output', nameWidth: 41, left: 382, right: 471 },
    { id: 'problems', name: 'Problems', nameWidth: 1, left: 471, right: 501 },
    { id: 'trace', name: 'Trace', nameWidth: 1, left: 651, right: 697 },
    { id: 'terminal', name: 'Terminal', nameWidth: 60, left: 1300, right: 1400 },
  ],
  runControlSets: 1,
  statusRail: [
    { text: 'Simulation' },
    { text: 'Mode\nSIMULATION' },
    { text: 'Runtime\nNative POSIX' },
    { text: 'Target\nLocal POSIX' },
    { text: 'Running' },
  ],
};

describe('interface budget counting (spec 013 section 8.1)', () => {
  it('counts the controls of the command bar on each side of the project name', () => {
    expect(commandBarCounts(snapshot)).toEqual({ left: 5, right: 2, total: 7 });
  });

  it('counts only controls that take room: a control of zero width is not in the bar', () => {
    const hidden = { ...snapshot, commandBar: { ...snapshot.commandBar, controls: [control('More commands', 0, 0)] } };
    expect(commandBarCounts(hidden)).toEqual({ left: 0, right: 0, total: 0 });
  });

  it('reports a results tab as named only when its name is visible', () => {
    expect(resultsTabCounts(snapshot)).toEqual({ total: 4, named: 1, namedIds: ['output'], unnamedIds: ['problems', 'trace', 'terminal'] });
  });

  it('counts every place the target is shown', () => {
    expect(targetPlaces(snapshot)).toEqual([
      'command bar: target selector',
      'status rail: Simulation',
      'status rail: Mode',
      'status rail: Target',
    ]);
  });

  it('counts a place for the Spanish words as well', () => {
    const spanish: InterfaceSnapshot = {
      ...snapshot,
      locale: 'es',
      commandBar: { ...snapshot.commandBar, controls: [control('Adónde va la ejecución: Simulación', 252, 88)] },
      statusRail: [{ text: 'Simulación' }, { text: 'Modo\nSIMULACIÓN' }, { text: 'Destino\nPOSIX local' }, { text: 'En ejecución' }],
    };
    expect(targetPlaces(spanish).length).toBe(4);
  });

  it('lists the items of the status rail by their first line', () => {
    expect(statusRailItems(snapshot)).toEqual(['Simulation', 'Mode', 'Runtime', 'Target', 'Running']);
  });
});

const targets: BudgetTargets = {
  commandBar: { simulation: { left: 7, right: 3, total: 10 }, board: { left: 9, right: 3 } },
  statusRailItems: 4,
  targetPlaces: 2,
  runControlSets: 1,
  resultsTabs: { total: 5, namedAtDefault: 5, reason: 'spec 013 row 2 and row 3' },
  paletteKinds: 7,
  searchLanguages: 5,
  boundaryStatements: 1,
  themeControls: 1,
  implementationTerms: 0,
};

/** Five tabs, every one with its name inside the strip: the results panel of spec 013 section 5.3 at 1366 by 768. */
const FIVE = ['output', 'problems', 'tests', 'trace', 'watch'].map((id, at) => ({
  id,
  name: id,
  nameWidth: 40,
  left: 382 + at * 100,
  right: 472 + at * 100,
}));

describe('interface budget check (spec 013 section 8.2 item 2)', () => {
  it('passes a snapshot within every target', () => {
    const within: InterfaceSnapshot = {
      ...snapshot,
      resultsTabs: FIVE,
      statusRail: [{ text: 'Simulation' }, { text: 'Running' }],
    };
    expect(checkBudget([measure(within)], targets)).toEqual([]);
  });

  it('fails on a count over its target and names the state, the language and the control', () => {
    const over: InterfaceSnapshot = {
      ...snapshot,
      state: 'paused',
      locale: 'es',
      commandBar: {
        ...snapshot.commandBar,
        controls: [
          ...snapshot.commandBar.controls,
          control('Conectar', 460, 60),
          control('Guardar todo', 40, 30),
          control('Extra', 80, 30),
        ],
      },
    };
    const violations = checkBudget([measure(over)], targets);
    expect(violations.length).toBeGreaterThan(0);
    const bar = violations.find((violation) => violation.includes('command bar'))!;
    expect(bar).toContain('paused');
    expect(bar).toContain('es');
    expect(bar).toContain('Conectar');
  });

  it('SHL-003 the budget fails when a default results tab is unnamed or when there are more than five', () => {
    const within: InterfaceSnapshot = { ...snapshot, resultsTabs: FIVE, statusRail: [{ text: 'Running' }] };
    expect(checkBudget([measure(within)], targets)).toEqual([]);
    const unnamed = { ...within, resultsTabs: FIVE.map((tab) => (tab.id === 'trace' ? { ...tab, nameWidth: 1 } : tab)) };
    const short = checkBudget([measure(unnamed)], targets);
    expect(short).toHaveLength(1);
    expect(short[0]).toContain('with their name');
    expect(short[0]).toContain('trace');
    const six = { ...within, resultsTabs: [...FIVE, { id: 'terminal', name: 'Terminal', nameWidth: 50, left: 882, right: 972 }] };
    const many = checkBudget([measure(six)], targets);
    expect(many).toHaveLength(1);
    expect(many[0]).toContain('results panel tabs has 6, over 5');
  });
});

/** What milestone U2 measures once per language (rows 10, 12 and 13) and once for the product (rows 11 and 17), within target. */
const KINDS = ['commands', 'files', 'objects', 'io', 'editors', 'lessons', 'preferences', 'scenes'];
const english: LocaleMeasures = { locale: 'en', paletteKinds: KINDS, boundaryStatements: 1, themeControls: 1 };
const product: ProductMeasures = { searchLanguages: ['ST', 'IL', 'LD', 'FBD', 'SFC'], implementationTerms: 0 };

describe('interface budget check of milestone U2 (spec 013 section 8.1 rows 10 to 13 and 17)', () => {
  it('passes the measures of U2 within their targets', () => {
    expect(checkMeasures([english, { ...english, locale: 'es' }], product, targets)).toEqual([]);
  });

  it('FND-001 the budget fails when the palette finds fewer than seven kinds of thing', () => {
    const violations = checkMeasures([{ ...english, locale: 'es', paletteKinds: KINDS.slice(0, 6) }], product, targets);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('es');
    expect(violations[0]).toContain('palette finds 6 kinds, under 7');
  });

  it('FND-003 the budget fails when search reads fewer than the five languages', () => {
    const violations = checkMeasures([english], { ...product, searchLanguages: ['ST', 'IL'] }, targets);
    expect(violations).toEqual(['search reads 2 of the languages (ST, IL), under 5']);
  });

  it('MSG-003 the budget fails when a result states its boundary other than once', () => {
    expect(checkMeasures([{ ...english, boundaryStatements: 2 }], product, targets)).toEqual([
      'en: the boundary is stated 2 times on one result, not 1',
    ]);
    expect(checkMeasures([{ ...english, boundaryStatements: 0 }], product, targets)).toHaveLength(1);
  });

  it('SHL-012 the budget fails when the theme has other than one control', () => {
    expect(checkMeasures([{ ...english, themeControls: 3 }], product, targets)).toEqual(['en: the theme has 3 controls, not 1']);
    expect(checkMeasures([{ ...english, themeControls: 0 }], product, targets)).toHaveLength(1);
  });

  it('MSG-002 the budget fails when a main-path surface holds an implementation term', () => {
    expect(checkMeasures([english], { ...product, implementationTerms: 2 }, targets)).toEqual([
      'implementation terms on the main-path surfaces: 2, over 0',
    ]);
  });
});
