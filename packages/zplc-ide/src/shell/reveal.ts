/**
 * The rules by which the shell moves by itself (SHL-010): which tab it shows, which region it opens, and whether it opens a
 * document, for each event. Nothing else moves the shell except a person asking. The table is pure; `reveal` applies a row
 * through the stores.
 */
import type { ConsoleTab } from '../types';
import { useIDEStore } from '../store/useIDEStore';
import { useShellLayout } from '../store/useShellLayout';

export type ShellEvent =
  | 'buildFailed'
  | 'buildSucceeded'
  | 'runStarted'
  | 'stoppedAtPlace'
  | 'fault'
  | 'testsFailed'
  | 'testsPassed'
  | 'lessonChecked'
  | 'messageToHiddenTab'
  | 'changeProposed';

export interface ShellMove {
  /** The tab of the results panel to show. */
  panel?: ConsoleTab;
  /** Open the results panel if it is collapsed. */
  openPanel?: boolean;
  /** Show the Guide, opening the secondary sidebar if it is hidden. */
  guide?: boolean;
  /** Open the document at the place of the event. */
  openDocument?: boolean;
}

const STAYS: ShellMove = Object.freeze({});

const TABLE: Readonly<Record<ShellEvent, ShellMove>> = {
  buildFailed: { panel: 'problems', openPanel: true },
  buildSucceeded: STAYS, // one notice, nothing moves
  runStarted: STAYS,
  stoppedAtPlace: { openDocument: true }, // the document, not the Watch tab
  fault: STAYS, // the status rail shows it and a notice links to the place and to Output
  testsFailed: { panel: 'tests', openPanel: true },
  testsPassed: STAYS,
  lessonChecked: { guide: true },
  messageToHiddenTab: STAYS, // the tab is marked (IDE-020), not switched to
  changeProposed: STAYS, // one notice with a Review action
};

/** What the shell does for an event, as in the table of SHL-010. */
export const movesFor = (event: ShellEvent): ShellMove => TABLE[event];

/** Applies the row of `event`; `at` is the place a document is opened at, when the row opens one. */
export function reveal(event: ShellEvent, at?: { path: string; line: number; column: number }): void {
  const move = movesFor(event);
  const ide = useIDEStore.getState();
  if (move.panel !== undefined) ide.setActiveConsoleTab(move.panel);
  if (move.openPanel && ide.isConsoleCollapsed) ide.toggleConsole();
  if (move.guide) useShellLayout.getState().setSecondaryVisible(true);
  if (move.openDocument && at) void ide.navigateToCompilerDiagnostic(at.path, at.line, at.column);
}
