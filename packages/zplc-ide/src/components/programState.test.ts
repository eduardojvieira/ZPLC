import { describe, expect, it } from 'bun:test';
import { translatorFor } from '../i18n';
import { getStatusDisplay, programStateOf, programStateText, type ProgramStateInput, type StatusInput } from './programState';

const base: StatusInput = {
  isConnected: true,
  vmState: 'idle',
  executionMode: 'simulate',
  programLoaded: false,
  currentBuild: true,
  anyBuild: true,
};

// Every state of 2.0's status (Toolbar getStatusDisplay) and the words of the table of MSG-007 for it.
const rows: Array<[string, Partial<StatusInput>, string, string]> = [
  ['simulation, not connected', { isConnected: false }, 'Stopped', 'Detenido'],
  ['board, not connected', { isConnected: false, executionMode: 'hardware' }, 'Not connected', 'No conectado'],
  ['running', { vmState: 'running' }, 'Running', 'En ejecución'],
  [
    'running, stale build',
    { vmState: 'running', currentBuild: false },
    'Running an older build',
    'En ejecución con una compilación anterior',
  ],
  ['paused', { vmState: 'paused' }, 'Paused', 'En pausa'],
  ['paused, stale build', { vmState: 'paused', currentBuild: false }, 'Paused on an older build', 'En pausa con una compilación anterior'],
  ['simulation ready', {}, 'Stopped', 'Detenido'],
  ['simulation ready, stale build', { currentBuild: false }, 'Stopped', 'Detenido'],
  ['simulation ready, never built', { currentBuild: false, anyBuild: false }, 'Stopped', 'Detenido'],
  ['board deployed', { executionMode: 'hardware', programLoaded: true }, 'Deployed · stopped', 'Cargado · detenido'],
  ['board connected, build current', { executionMode: 'hardware' }, 'Connected · deploy needed', 'Conectado · falta cargar'],
  [
    'board connected, stale build',
    { executionMode: 'hardware', currentBuild: false },
    'Connected · rebuild needed',
    'Conectado · compilación desactualizada',
  ],
  [
    'board connected, never built',
    { executionMode: 'hardware', currentBuild: false, anyBuild: false },
    'Connected · build needed',
    'Conectado · falta compilar',
  ],
  ['error', { vmState: 'error' }, 'Fault', 'Falla'],
];

describe('MSG-007 the table of state words', () => {
  it('MSG-007 every state of the 2.0 status maps to one row, and two different states never read the same', () => {
    const en = translatorFor('en').t;
    const words = new Map<string, string[]>();
    for (const [name, over, text] of rows) {
      expect(getStatusDisplay({ ...base, ...over }, en).text).toBe(text);
      words.set(text, [...(words.get(text) ?? []), name]);
    }
    // The only words shared by two states are the one exception of MSG-007: in simulation ready and ready with a stale build,
    // and the simulation that has no connection to show (its session is implicit, FLW-008).
    for (const [text, names] of words) {
      if (names.length > 1) {
        expect(text).toBe('Stopped');
        expect(names.every((name) => name.startsWith('simulation'))).toBe(true);
      }
    }
    expect(words.size).toBe(rows.length - 3);
  });

  it(
    'MSG-007 the one exception: in simulation, ready and ready with a stale build both read Stopped, and the Build control carries the ' +
      'mark',
    () => {
      const en = translatorFor('en').t;
      const ready = getStatusDisplay(base, en);
      const stale = getStatusDisplay({ ...base, currentBuild: false }, en);
      expect(ready.text).toBe('Stopped');
      expect(stale.text).toBe('Stopped');
      // the stale build is not offered as an action while nothing runs: Run rebuilds by itself (FLW-001); the mark is on Build
      expect(stale.state.action).toBeUndefined();
    },
  );

  it('MSG-007 Spanish says every state in the register of D-10, with the same rows', () => {
    const es = translatorFor('es').t;
    for (const [, over, , text] of rows) expect(getStatusDisplay({ ...base, ...over }, es).text).toBe(text);
  });

  it('MSG-007 a pause is worded at its place, and a fault with its reason', () => {
    const en = translatorFor('en').t;
    const input: ProgramStateInput = {
      target: 'simulation',
      connected: true,
      transport: 'paused',
      buildExists: true,
      currentBuild: true,
      programLoaded: true,
      place: 'main.st, line 4',
    };
    expect(programStateText(programStateOf(input), en)).toBe('Paused at main.st, line 4');
    expect(programStateText(programStateOf({ ...input, transport: 'faulted', reason: 'division by zero' }), en)).toBe(
      'Fault: division by zero',
    );
    expect(programStateText(programStateOf({ ...input, place: undefined }), translatorFor('es').t)).toBe('En pausa');
  });

  it('PLS-013 a plant session slower than real time reads Running slower than real time', () => {
    const input: ProgramStateInput = {
      target: 'simulation',
      connected: true,
      transport: 'running',
      slowdown: 0.4,
      buildExists: true,
      currentBuild: true,
      programLoaded: true,
    };
    expect(programStateText(programStateOf(input), translatorFor('en').t)).toBe('Running slower than real time');
    expect(programStateText(programStateOf(input), translatorFor('es').t)).toBe('En ejecución más lenta que el tiempo real');
    expect(programStateOf({ ...input, slowdown: 1 }).key).toBe('running');
  });

  it('PLS-013 a held scan reads Paused at its place', () => {
    const state = programStateOf({
      target: 'simulation',
      connected: true,
      transport: 'held',
      buildExists: true,
      currentBuild: true,
      programLoaded: true,
      place: 'main.st, line 9',
    });
    expect(programStateText(state, translatorFor('en').t)).toBe('Paused at main.st, line 9');
  });

  it('FLW-012 a stale running build offers Rebuild and restart in simulation and Build on a board, never a deploy', () => {
    const stale = { connected: true, transport: 'running' as const, buildExists: true, currentBuild: false, programLoaded: true };
    expect(programStateOf({ ...stale, target: 'simulation' }).action).toBe('debug.rebuildAndRestart');
    expect(programStateOf({ ...stale, target: 'board' }).action).toBe('build.compile');
    expect(programStateOf({ ...stale, target: 'board', transport: 'stopped' }).action).toBe('build.compile');
    expect(
      programStateOf({ ...stale, target: 'board', currentBuild: true, transport: 'stopped', programLoaded: false }).action,
    ).toBeUndefined();
  });
});
