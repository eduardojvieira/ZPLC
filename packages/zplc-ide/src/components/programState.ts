/**
 * The words of the program's state in the command bar's status rail: one table (spec 013 MSG-007, decision D-23). `programStateOf`
 * works the row out from plain values; `getStatusDisplay` is the thin form the toolbar calls with its own state. A plant session
 * that is bound speaks through the same table (PLS-013): the rail has no second status for it.
 */
import { EXECUTION_MODE, type ExecutionMode } from './runtimeArtifactSelection';
import type { OperationalStatusTone } from './operationalStatusPresentation';
import type { VMState } from '../runtime/debugAdapter';
import type { TransportState } from '../runtime/transport';
import { registeredPlantTransport } from '../store/useTransport';
import type { Translator } from '../i18n';

export type ProgramStateKey =
  | 'stopped'
  | 'notConnected'
  | 'buildNeeded'
  | 'rebuildNeeded'
  | 'deployNeeded'
  | 'deployedStopped'
  | 'running'
  | 'runningOlder'
  | 'runningSlow'
  | 'paused'
  | 'pausedAt'
  | 'pausedOlder'
  | 'fault'
  | 'faultReason';

/** The action the rail offers beside the state (FLW-012). */
export type ProgramStateAction = 'debug.rebuildAndRestart' | 'build.compile';

export interface ProgramStateInput {
  target: 'simulation' | 'board';
  /** A board is connected. A simulation needs no connection: its session is implicit (FLW-008). */
  connected: boolean;
  transport: TransportState;
  /** 1 = real time; below 1 a plant session runs slower than real time (PLS-013). */
  slowdown?: number;
  /** Some build was made in this session, current or not. */
  buildExists: boolean;
  /** The last build is of the current sources. */
  currentBuild: boolean;
  /** The current build is in the runtime. */
  programLoaded: boolean;
  /** Where a pause is, already worded ("main.st, line 4"). A held scan reads Paused at its place too. */
  place?: string;
  /** Why the program or the plant faulted. */
  reason?: string;
}

export interface ProgramState {
  key: ProgramStateKey;
  params: Record<string, string>;
  tone: OperationalStatusTone;
  action?: ProgramStateAction;
}

/** One row of the table of MSG-007 for one state of the program. */
export function programStateOf(input: ProgramStateInput): ProgramState {
  const { target, connected, transport, buildExists, currentBuild, programLoaded } = input;
  const board = target === 'board';
  if (board && !connected) return { key: 'notConnected', params: {}, tone: 'neutral' };
  // Sources changed after the build that is running: the rail says so and offers one action (FLW-012); a board is never deployed from here.
  const action: ProgramStateAction = board ? 'build.compile' : 'debug.rebuildAndRestart';
  switch (transport) {
    case 'running':
      if (!currentBuild) return { key: 'runningOlder', params: {}, tone: 'attention', action };
      return (input.slowdown ?? 1) < 1
        ? { key: 'runningSlow', params: {}, tone: 'attention' }
        : { key: 'running', params: {}, tone: 'success' };
    case 'paused':
    case 'held':
      if (!currentBuild) return { key: 'pausedOlder', params: {}, tone: 'attention', action };
      return input.place
        ? { key: 'pausedAt', params: { place: input.place }, tone: 'attention' }
        : { key: 'paused', params: {}, tone: 'attention' };
    case 'faulted':
      return input.reason
        ? { key: 'faultReason', params: { reason: input.reason }, tone: 'danger' }
        : { key: 'fault', params: {}, tone: 'danger' };
    default:
      if (!board) return { key: 'stopped', params: {}, tone: 'info' };
      if (programLoaded && currentBuild) return { key: 'deployedStopped', params: {}, tone: 'info' };
      if (currentBuild) return { key: 'deployNeeded', params: {}, tone: 'info' };
      return buildExists
        ? { key: 'rebuildNeeded', params: {}, tone: 'attention', action: 'build.compile' }
        : { key: 'buildNeeded', params: {}, tone: 'info' };
  }
}

/** The state in words, in the language of the interface. */
export function programStateText(state: ProgramState, t: Translator['t']): string {
  return t(`studio.status.state.${state.key}`, state.params);
}

/** What the toolbar knows about the program, in the shape of 2.0. */
export interface StatusInput {
  isConnected: boolean;
  vmState: VMState;
  executionMode: ExecutionMode;
  /** The current build is in the runtime. */
  programLoaded: boolean;
  /** The last build is of the current sources. */
  currentBuild: boolean;
  /** Some build was made in this session, current or not. */
  anyBuild: boolean;
}

/** The transport state of a debug-controller state (contract C8): anything but running, paused and error is stopped. */
export function transportStateOfVm(vmState: VMState): TransportState {
  return vmState === 'running' ? 'running' : vmState === 'paused' ? 'paused' : vmState === 'error' ? 'faulted' : 'stopped';
}

export function programStateInputOf(input: StatusInput): ProgramStateInput {
  return {
    target: input.executionMode === EXECUTION_MODE.HARDWARE ? 'board' : 'simulation',
    connected: input.isConnected,
    transport: transportStateOfVm(input.vmState),
    buildExists: input.anyBuild,
    currentBuild: input.currentBuild,
    programLoaded: input.programLoaded,
  };
}

/** The plant session's transport while a plant document has bound one (PLS-013). */
export function boundPlantTransport() {
  return registeredPlantTransport();
}

export function getStatusDisplay(
  input: StatusInput,
  t: Translator['t'],
): { text: string; tone: OperationalStatusTone; input: ProgramStateInput; state: ProgramState } {
  const base = programStateInputOf(input);
  const plant = boundPlantTransport();
  const merged: ProgramStateInput = plant ? { ...base, transport: plant.state, slowdown: plant.slowdown } : base;
  const state = programStateOf(merged);
  return { text: programStateText(state, t), tone: state.tone, input: merged, state };
}
