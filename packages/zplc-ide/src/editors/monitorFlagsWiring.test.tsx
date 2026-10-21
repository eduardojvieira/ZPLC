// UX-009 / LNG-006: a forced variable and a variable the poll could not read reach the pins of FBD, the steps and
// transitions of SFC, and the elements of Ladder, through the debug map, and each editor draws them in the signal
// vocabulary: forced = amber, a diamond and the word FORCED; fault = red, a triangle and the word FAULT.
//
// The trace is a recorded scan: the values the runtime held for the names the real debug map of each file gives
// (see monitoring/runtime.test.ts for the run that records them), with one forced variable and one faulted element.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { compileSingleFileWithTask, type DebugMap } from '../compiler';
import type { FBDModel } from '../models/fbd';
import type { SFCModel } from '../models/sfc';
import type { MonitorEntry } from '../models/sourceElements';
import { readElementStates, type Reading } from '../monitoring/elementStates';
import { monitorKey, resolveVariable } from '../monitoring/debugVariables';
import { signalFlagsOf } from '../monitoring/signalFlags';
import { SIGNAL_CUES } from '../theme/signalTone';
import FunctionBlockNode from './fbd/nodes/FunctionBlockNode';
import VariableNode from './fbd/nodes/VariableNode';
import { pinFlagsOf, pinValuesOf } from './fbd/pinState';
import SFCStepNode from './sfc/nodes/SFCStepNode';
import SFCTransitionNode from './sfc/nodes/SFCTransitionNode';
import { stepDebugData, stepDebugInfoOf, transitionDebugData, transitionDebugInfoOf } from './sfc/debugInfo';
import { debugValuesOf } from './ld/debugValues';

const root = join(import.meta.dir, '../..');
const nodeProps = (id: string, data: Record<string, unknown>) => ({ id, selected: false, data }) as unknown as NodeProps;
const flow = (node: React.ReactElement) => renderToStaticMarkup(<ReactFlowProvider>{node}</ReactFlowProvider>);

function build(path: string, text: string, language: 'FBD' | 'SFC'): { map: DebugMap; entries: readonly MonitorEntry[] } {
  const built = compileSingleFileWithTask(text, language, { sourceRef: path, programName: 'Main', intervalMs: 10 });
  const pou = Object.values(built.debugMap.pou).find((candidate) => candidate.sourceRef === path)!;
  return { map: built.debugMap, entries: pou.monitor ?? [] };
}

describe('FBD: a forced variable and a faulted pin reach the nodes and the wires', () => {
  const path = 'projects/blinky_fbd/src/main.fbd.json';
  const text = readFileSync(join(root, path), 'utf8');
  const model = JSON.parse(text) as FBDModel;
  const { map, entries } = build(path, text, 'FBD');
  // one recorded scan of the blinker: the LED is on (forced by the user), the off timer runs
  const trace: Record<string, Reading> = {
    LED_Output: true,
    _not_led_OUT: false,
    _ton_off_Q: false,
    'OffTimer.ET': 120,
    _ton_on_Q: false,
    'OnTimer.ET': 0,
    _not_on_done_OUT: true,
    _or_set_or_hold_OUT: false,
    _and_run_OUT: false,
  };
  const forced = new Map([['LED_Output', { address: resolveVariable(map, path, 'LED_Output')!.address }]]);
  const faults = new Set([monitorKey(path, 'OffTimer.ET')]);
  const flagsOf = signalFlagsOf(map, path, forced, faults);
  const states = readElementStates(entries, (variable) => trace[variable], flagsOf);
  const pins = pinValuesOf(model.blocks, model.connections, states);
  const flags = pinFlagsOf(model.blocks, model.connections, states);

  it('UX-009 puts the forced variable on its variable block and on the pin that is wired to it', () => {
    expect(flags.get('var_led_read')).toEqual({ OUT: { forced: true } });
    // the block that writes LED_Output shows the variable itself, forced, and not what is wired to it
    expect(flags.get('output_led')?.IN).toEqual({ forced: true });
    expect(pins.get('output_led')?.IN).toBe(true);
    // the NOT block reads LED_Output through a wire: its input pin shows what is wired to it, forced
    expect(flags.get('not_led')?.IN).toEqual({ forced: true });
  });

  it('UX-009 puts the fault on the pin whose variable could not be read, and on no other', () => {
    expect(flags.get('ton_off')).toEqual({ ET: { fault: true } });
    // the on timer has no fault: its IN is wired to the forced LED, and nothing else is flagged
    expect(flags.get('ton_on')).toEqual({ IN: { forced: true } });
  });

  it('UX-009 draws the forced variable block amber with a diamond and the word FORCED', () => {
    const markup = flow(
      <VariableNode
        {...nodeProps('var_led_read', {
          type: 'variable',
          variableName: 'LED_Output',
          debugActive: true,
          pinValues: pins.get('var_led_read'),
          pinFlags: flags.get('var_led_read'),
        })}
      />,
    );
    expect(markup).toContain('data-signal="forced"');
    expect(markup).toContain('var(--signal-forced-fg)');
    expect(markup).toContain(SIGNAL_CUES.forced.glyph);
    expect(markup).toContain(SIGNAL_CUES.forced.label);
  });

  it('UX-009 draws the faulted pin of a timer red with a triangle and the word FAULT, and its Q as it was', () => {
    const markup = flow(
      <FunctionBlockNode
        {...nodeProps('ton_off', {
          type: 'TON',
          instanceName: 'OffTimer',
          debugActive: true,
          pinValues: pins.get('ton_off'),
          pinFlags: flags.get('ton_off'),
        })}
      />,
    );
    expect(markup).toContain('data-signal="fault"');
    expect(markup).toContain(SIGNAL_CUES.fault.glyph);
    // a pin says it for a screen reader in words; the pin of the other output keeps its own state
    expect(markup).toContain(SIGNAL_CUES.fault.description);
    expect(markup).toContain('data-signal="false"');
    expect(markup).not.toContain('data-signal="forced"');
  });

  it('UX-009 draws a diagram nobody forces and the poll read completely with no forced or fault cue', () => {
    const calm = readElementStates(entries, (variable) => trace[variable], signalFlagsOf(map, path, new Map(), new Set()));
    const calmFlags = pinFlagsOf(model.blocks, model.connections, calm);
    expect([...calmFlags.values()].every((pinsOf) => Object.keys(pinsOf).length === 0)).toBe(true);
    const markup = flow(
      <FunctionBlockNode
        {...nodeProps('ton_off', {
          type: 'TON',
          instanceName: 'OffTimer',
          debugActive: true,
          pinValues: pinValuesOf(model.blocks, model.connections, calm).get('ton_off'),
          pinFlags: calmFlags.get('ton_off'),
        })}
      />,
    );
    expect(markup).not.toContain('data-signal="fault"');
    expect(markup).not.toContain('data-signal="forced"');
  });
});

describe('SFC: a forced input and a faulted step reach the steps and transitions', () => {
  const path = 'src/chart.sfc.json';
  const chart: SFCModel = {
    name: 'Chart',
    variables: { local: [], inputs: [{ name: 'Go', type: 'BOOL', address: '%I0.0' }], outputs: [] },
    steps: [
      { id: 'idle', name: 'Idle', isInitial: true, position: { x: 0, y: 0 } },
      { id: 'work', name: 'Work', isInitial: false, position: { x: 0, y: 200 } },
    ],
    transitions: [
      { id: 'start', fromStep: 'idle', toStep: 'work', condition: 'Go', position: { x: 0, y: 100 } },
      { id: 'finish', fromStep: 'work', toStep: 'idle', condition: 'NOT Go', position: { x: 0, y: 300 } },
    ],
  } as SFCModel;
  const { map, entries } = build(path, JSON.stringify(chart), 'SFC');
  // a recorded scan: Idle is active and Go, which the user forces, holds TRUE; the flag of Work could not be read
  const trace: Record<string, Reading> = {
    X_idle: true,
    'T_idle.ET': 40,
    'T_work.ET': 0,
    _C_start: true,
    _F_start: false,
    _C_finish: false,
    _F_finish: false,
    Go: true,
  };
  const forced = new Map([['Go', { address: resolveVariable(map, path, 'Go')!.address }]]);
  const faults = new Set([monitorKey(path, 'X_work')]);
  const flagsOf = signalFlagsOf(map, path, forced, faults);
  const states = readElementStates(entries, (variable) => trace[variable], flagsOf);
  const stepInfo = stepDebugInfoOf(chart.steps, states);
  const active = new Set(chart.steps.filter((step) => stepInfo.get(step.id)?.isActive).map((step) => step.id));
  const transitionInfo = transitionDebugInfoOf(chart.transitions, states, active, flagsOf);

  it('UX-009 marks the step whose flag could not be read as a fault, and the others as nothing', () => {
    expect(stepInfo.get('work')?.fault).toBe(true);
    expect(stepInfo.get('idle')?.fault).toBeUndefined();
    const markup = flow(
      <SFCStepNode {...nodeProps('work', { name: 'Work', isInitial: false, debugActive: true, ...stepDebugData(stepInfo.get('work')) })} />,
    );
    expect(markup).toContain('data-signal="fault"');
    expect(markup).toContain(SIGNAL_CUES.fault.glyph);
    expect(markup).toContain(SIGNAL_CUES.fault.label);
  });

  it('UX-009 marks every transition whose condition reads the forced input as forced, by the names the map resolves', () => {
    expect(transitionInfo.get('start')?.forced).toBe(true);
    expect(transitionInfo.get('finish')?.forced).toBe(true);
    const markup = flow(
      <SFCTransitionNode
        {...nodeProps('start', { condition: 'Go', debugActive: true, ...transitionDebugData(transitionInfo.get('start')) })}
      />,
    );
    expect(markup).toContain('data-signal="forced"');
    expect(markup).toContain(SIGNAL_CUES.forced.glyph);
    expect(markup).toContain(SIGNAL_CUES.forced.label);
  });

  it('UX-009 does not call a transition forced because a word of its condition is a keyword or a literal', () => {
    const other = transitionDebugInfoOf(
      [
        { id: 'x', fromStep: 'idle', toStep: 'work', condition: 'NOT (Count > 3) AND T#5s > T#1s AND TRUE', position: { x: 0, y: 0 } },
      ] as SFCModel['transitions'],
      states,
      active,
      flagsOf,
    );
    expect(other.get('x')?.forced).toBeUndefined();
  });
});

describe('Ladder: the same flags decide what a contact and a coil show', () => {
  it('UX-009 marks a forced variable forced and an unreadable one faulted in the values Ladder draws', () => {
    const values = debugValuesOf({
      active: true,
      values: new Map([
        ['StartPB', { reading: true, type: 'BOOL', known: true }],
        ['Overload', { reading: undefined, type: 'BOOL', known: true }],
        ['Motor', { reading: false, type: 'BOOL', known: true }],
      ]),
      flagsOf: (variable) =>
        (({ StartPB: { forced: true }, Overload: { fault: true } }) as Record<string, { forced?: boolean; fault?: boolean }>)[variable],
    })!;
    expect(values.get('StartPB')).toMatchObject({ forced: true, error: null });
    expect(values.get('Overload')?.error).toBeTruthy();
    expect(values.get('Motor')).toMatchObject({ forced: false, error: null });
  });
});
