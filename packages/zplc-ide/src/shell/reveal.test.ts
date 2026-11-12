import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { projectLoaderStub } from '../test/projectLoaderStub';

await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { useIDEStore } = await import('../store/useIDEStore');
const { useShellLayout } = await import('../store/useShellLayout');
const { movesFor, reveal } = await import('./reveal');
type ShellEvent = import('./reveal').ShellEvent;

const NOTHING = {};

describe('the rules by which the shell moves (SHL-010)', () => {
  it('SHL-010 a failed build shows Problems and opens the panel', () => {
    expect(movesFor('buildFailed')).toEqual({ panel: 'problems', openPanel: true });
  });
  it('SHL-010 a successful build moves nothing', () => expect(movesFor('buildSucceeded')).toEqual(NOTHING));
  it('SHL-010 a run that starts moves nothing', () => expect(movesFor('runStarted')).toEqual(NOTHING));
  it('SHL-010 passing tests move nothing', () => expect(movesFor('testsPassed')).toEqual(NOTHING));
  it('SHL-010 a stop at a breakpoint opens the document and not the Watch tab', () => {
    expect(movesFor('stoppedAtPlace')).toEqual({ openDocument: true });
    expect(movesFor('stoppedAtPlace').panel).toBeUndefined();
  });
  it('SHL-010 a fault moves no tab: the status rail shows it', () => expect(movesFor('fault')).toEqual(NOTHING));
  it('SHL-010 a failed test shows Test results', () => expect(movesFor('testsFailed')).toEqual({ panel: 'tests', openPanel: true }));
  it('SHL-010 a lesson check opens the Guide', () => expect(movesFor('lessonChecked')).toEqual({ guide: true }));
  it('SHL-010 a message to a hidden tab moves nothing', () => expect(movesFor('messageToHiddenTab')).toEqual(NOTHING));
  it('SHL-010 a proposed change moves nothing: one notice', () => expect(movesFor('changeProposed')).toEqual(NOTHING));
});

describe('applying a row (SHL-010)', () => {
  beforeEach(() => {
    useIDEStore.setState({ activeConsoleTab: 'output', isConsoleCollapsed: true });
    useShellLayout.setState({ secondaryVisible: false });
  });

  it('SHL-010 a failed build shows Problems and opens a collapsed panel', () => {
    reveal('buildFailed');
    expect(useIDEStore.getState().activeConsoleTab).toBe('problems');
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(false);
  });

  it('SHL-010 the events that move nothing leave the tab, the panel and the Guide as they were', () => {
    const quiet: ShellEvent[] = ['buildSucceeded', 'runStarted', 'fault', 'testsPassed', 'messageToHiddenTab', 'changeProposed'];
    for (const event of quiet) reveal(event);
    expect(useIDEStore.getState().activeConsoleTab).toBe('output');
    expect(useIDEStore.getState().isConsoleCollapsed).toBe(true);
    expect(useShellLayout.getState().secondaryVisible).toBe(false);
  });

  it('SHL-010 a lesson check opens the Guide if it is hidden and leaves the results tab alone', () => {
    reveal('lessonChecked');
    expect(useShellLayout.getState().secondaryVisible).toBe(true);
    expect(useIDEStore.getState().activeConsoleTab).toBe('output');
  });
});
