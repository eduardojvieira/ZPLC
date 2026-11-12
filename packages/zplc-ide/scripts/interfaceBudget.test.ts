import { describe, expect, it } from 'bun:test';
import { commandBarCounts, resultsTabCounts, statusRailItems, targetPlaces, type InterfaceSnapshot } from './interfaceBudget';

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
      control('Simulation mode', 252, 88),
      control('Hardware mode', 339, 94),
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
  statusRail: [
    { text: 'Simulation · native runtime' },
    { text: 'Mode\nSIMULATION' },
    { text: 'Runtime\nNative POSIX' },
    { text: 'Target\nLocal POSIX' },
    { text: 'Running' },
  ],
};

describe('interface budget counting (spec 013 section 8.1)', () => {
  it('counts the controls of the command bar on each side of the project name', () => {
    expect(commandBarCounts(snapshot)).toEqual({ left: 6, right: 2, total: 8 });
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
      'status rail: Simulation · native runtime',
      'status rail: Mode',
      'status rail: Target',
    ]);
  });

  it('counts a place for the Spanish words as well', () => {
    const spanish: InterfaceSnapshot = {
      ...snapshot,
      locale: 'es',
      commandBar: { ...snapshot.commandBar, controls: [control('Modo de simulación', 252, 88), control('Modo de hardware', 339, 94)] },
      statusRail: [
        { text: 'Simulación · runtime nativo' },
        { text: 'Modo\nSIMULACIÓN' },
        { text: 'Destino\nPOSIX local' },
        { text: 'En ejecución' },
      ],
    };
    expect(targetPlaces(spanish).length).toBe(4);
  });

  it('lists the items of the status rail by their first line', () => {
    expect(statusRailItems(snapshot)).toEqual(['Simulation · native runtime', 'Mode', 'Runtime', 'Target', 'Running']);
  });
});
