import { describe, expect, it } from 'bun:test';
import type { Node } from '@xyflow/react';

import type { SFCModel } from '../../models/sfc';
import { SFC_PALETTE } from '../../models/sfcSupport';
import { transpileSFCToST } from '../../transpiler/sfcToST';
import { actionFor, actionsOf, parseChord } from '../keymap';
import { nodesToSteps, nodesToTransitions } from './graphModel';
import { paletteChoices, runSFCCommand, SFC_EDITOR_COMMANDS, SFC_MODEL_COMMANDS, type SFCOutcome, type SFCState } from './keyboard';

const document = (): SFCModel => ({
  name: 'Main',
  variables: {
    inputs: [
      { name: 'Start', type: 'BOOL' },
      { name: 'Done', type: 'BOOL' },
      { name: 'Level', type: 'INT' },
    ],
    outputs: [{ name: 'Lamp', type: 'BOOL' }],
    local: [{ name: 'Motor', type: 'BOOL' }],
  },
  steps: [],
  transitions: [],
});

interface Session {
  model: SFCModel;
  state: SFCState;
  said: string[];
  commits: number;
  last?: SFCOutcome;
}

const start = (): Session => ({ model: document(), state: { nodes: [], edges: [] }, said: [], commits: 0 });

function take(session: Session, outcome: SFCOutcome): SFCOutcome {
  session.state = { nodes: outcome.nodes, edges: outcome.edges };
  session.said.push(outcome.say);
  if (outcome.changed) session.commits += 1;
  session.last = outcome;
  return outcome;
}

const run = (session: Session, command: string, argument = {}) =>
  take(session, runSFCCommand(session.model, session.state, command, argument));

function press(session: Session, keys: string[]): Session {
  for (const chord of keys) {
    const command = actionFor('sfc', parseChord(chord));
    if (!command) throw new Error(`${chord} is not bound in the sequential function chart editor`);
    run(session, command);
  }
  return session;
}

const selected = (session: Session): Node | undefined => session.state.nodes.find((node) => node.selected);
const data = (node: Node | undefined) => (node?.data ?? {}) as Record<string, unknown>;
const stepNamed = (session: Session, name: string): Node =>
  session.state.nodes.find((node) => node.type === 'step' && data(node).name === name)!;
const documentOf = (session: Session): SFCModel => ({
  ...session.model,
  steps: nodesToSteps(session.state.nodes),
  transitions: nodesToTransitions(session.state.nodes, session.state.edges),
});

describe('LNG-012 sequential function chart keyboard authoring', () => {
  it('builds Init -[Start]-> Run -[Done]-> Init from the keyboard alone, and the build reads it', () => {
    const session = start();
    press(session, ['Shift+S']);
    run(session, 'bindVariable', { name: 'Init' });
    expect(data(selected(session))).toMatchObject({ name: 'Init', isInitial: true });
    press(session, ['T']);
    expect(data(selected(session))).toMatchObject({ condition: 'TRUE' });
    run(session, 'bindVariable', { name: 'Start' });
    press(session, ['S']);
    run(session, 'bindVariable', { name: 'Run' });
    press(session, ['T']);
    run(session, 'bindVariable', { name: 'Done' });

    // the second transition leads back to the initial step: a wire drawn from its list
    const asked = run(session, 'connect');
    const back = asked.choices!.find((item) => item.label.endsWith('→ Init'))!;
    run(session, 'connect', { wire: back.id });

    const model = documentOf(session);
    expect(model.steps.map((step) => [step.name, step.isInitial])).toEqual([
      ['Init', true],
      ['Run', false],
    ]);
    expect(model.transitions.map((transition) => [transition.fromStep, transition.toStep, transition.condition])).toEqual([
      [stepNamed(session, 'Init').id, stepNamed(session, 'Run').id, 'Start'],
      [stepNamed(session, 'Run').id, stepNamed(session, 'Init').id, 'Done'],
    ]);
    const built = transpileSFCToST(model);
    expect(built.errors).toEqual([]);
    expect(built.success).toBe(true);
  });

  it('inserts a transition below the selected step, wired to it, and a step below the selected transition, wired to it', () => {
    const session = start();
    press(session, ['Shift+S']);
    const step = selected(session)!;
    press(session, ['T']);
    const transition = selected(session)!;
    expect(transition.type).toBe('transition');
    expect(transition.position.y).toBeGreaterThan(step.position.y);
    expect(session.state.edges.map((edge) => [edge.source, edge.sourceHandle, edge.target, edge.targetHandle])).toEqual([
      [step.id, 'out', transition.id, 'in'],
    ]);
    press(session, ['S']);
    const next = selected(session)!;
    expect(next.type).toBe('step');
    expect(data(next).isInitial).toBe(false);
    expect(session.state.edges.map((edge) => [edge.source, edge.target])).toEqual([
      [step.id, transition.id],
      [transition.id, next.id],
    ]);
  });

  it('gives the new steps and transitions names and ids that nothing else has', () => {
    const session = start();
    press(session, ['S', 'S', 'S']);
    expect(session.state.nodes.map((node) => data(node).name)).toEqual(['Step_1', 'Step_2', 'Step_3']);
    expect(new Set(session.state.nodes.map((node) => node.id)).size).toBe(3);
  });

  it('puts a step that is not below a transition beside the cursor, unwired, and says how to join it', () => {
    const session = start();
    press(session, ['Shift+S', 'S']);
    expect(session.state.edges).toHaveLength(0);
    expect(session.said.at(-1)).toContain('transition');
  });

  it('is one change of the document for each command that changes it, and none for moving', () => {
    const session = start();
    press(session, ['Shift+S', 'T']);
    const commits = session.commits;
    press(session, ['Alt+ArrowUp', 'Alt+ArrowDown', 'Home']);
    expect(session.commits).toBe(commits);
  });
});

describe('LNG-012 sequential function chart cursor', () => {
  const chart = (): Session => {
    const session = start();
    press(session, ['Shift+S', 'T', 'S']);
    return session;
  };

  it('moves to the nearest step or transition in a direction with Alt and the arrows', () => {
    const session = chart();
    const [first, middle, last] = session.state.nodes;
    press(session, ['Home']);
    expect(selected(session)?.id).toBe(first!.id);
    press(session, ['Alt+ArrowDown']);
    expect(selected(session)?.id).toBe(middle!.id);
    press(session, ['Alt+ArrowDown']);
    expect(selected(session)?.id).toBe(last!.id);
    press(session, ['Alt+ArrowDown']);
    expect(session.said.at(-1)).toContain('There is no element below');
    press(session, ['Alt+ArrowUp', 'Alt+ArrowUp']);
    expect(selected(session)?.id).toBe(first!.id);
  });

  it('says there is nothing when the chart is empty', () => {
    const session = start();
    press(session, ['Home']);
    expect(session.last?.refused).toBe(true);
  });
});

describe('LNG-012 naming and conditions from the declared symbols', () => {
  it('offers a transition the BOOL symbols, takes one as its condition, and takes an expression typed', () => {
    const session = start();
    press(session, ['Shift+S', 'T']);
    const asked = run(session, 'bindVariable');
    expect(asked.choices?.map((item) => item.label)).toEqual(['Start', 'Done', 'Lamp', 'Motor']);
    expect(asked.allowFreeText).toBe(true);
    run(session, 'bindVariable', { name: 'Start AND NOT Done' });
    expect(data(selected(session)).condition).toBe('Start AND NOT Done');
  });

  it('names a step, and refuses a name that is no identifier or that another step has', () => {
    const session = start();
    press(session, ['S']);
    run(session, 'bindVariable', { name: 'Fill' });
    expect(data(selected(session)).name).toBe('Fill');
    press(session, ['S']);
    expect(run(session, 'bindVariable', { name: 'fill' }).refused).toBe(true);
    expect(run(session, 'bindVariable', { name: 'two words' }).refused).toBe(true);
  });

  it('refuses an empty condition', () => {
    const session = start();
    press(session, ['Shift+S', 'T']);
    expect(run(session, 'bindVariable', { name: '  ' }).refused).toBe(true);
  });
});

describe('LNG-012 connecting and deleting in the chart from the keyboard', () => {
  const separate = (): Session => {
    const session = start();
    run(session, 'insertElement', { elementType: 'initial_step' });
    run(session, 'insertElement', { elementType: 'transition' });
    // the transition was put below the initial step and wired to it: remove that wire to wire it by hand
    return session;
  };

  it('lists the wires a transition can have to the steps, both ways, and draws the chosen one as one change', () => {
    const session = separate();
    const wire = session.state.edges[0]!;
    const asked = run(session, 'disconnect');
    expect(asked.prompt).toMatchObject({ kind: 'disconnect' });
    run(session, 'disconnect', { edgeId: wire.id });
    expect(session.state.edges).toHaveLength(0);
    const labels = run(session, 'connect').choices!.map((item) => item.label);
    expect(labels).toHaveLength(2);
    const commits = session.commits;
    const choice = session.last!.choices![0]!;
    run(session, 'connect', { wire: choice.id });
    expect(session.state.edges).toHaveLength(1);
    expect(session.commits).toBe(commits + 1);
  });

  it('replaces the source of a transition that has one, as drawing the wire by hand does, and says so', () => {
    const session = start();
    press(session, ['Shift+S', 'T']);
    run(session, 'insertElement', { elementType: 'step' });
    // select the transition and ask for its wires: the second step could feed it, replacing the initial step
    const transition = session.state.nodes.find((node) => node.type === 'transition')!;
    session.state = {
      nodes: session.state.nodes.map((node) => ({ ...node, selected: node.id === transition.id })),
      edges: session.state.edges,
    };
    const choices = run(session, 'connect').choices!;
    const replacing = choices.find((item) => item.label.startsWith('Step_'));
    expect(replacing?.detail).toContain('replaces');
    run(session, 'connect', { wire: replacing!.id });
    expect(session.state.edges.filter((edge) => edge.target === transition.id)).toHaveLength(1);
    expect(session.state.edges.find((edge) => edge.target === transition.id)?.source).toBe(replacing && JSON.parse(replacing.id)[0]);
  });

  it('deletes the selected element with the wires on it as one change', () => {
    const session = start();
    press(session, ['Shift+S', 'T', 'S']);
    const commits = session.commits;
    press(session, ['Alt+ArrowUp', 'Delete']);
    // the transition was in the middle: the two wires on it go with it
    expect(session.state.nodes.map((node) => node.type)).toEqual(['step', 'step']);
    expect(session.state.edges).toHaveLength(0);
    expect(session.commits).toBe(commits + 1);
  });

  it('asks for a comment and sets it', () => {
    const session = start();
    press(session, ['Shift+S']);
    expect(run(session, 'editComment').prompt).toMatchObject({ kind: 'comment' });
    run(session, 'editComment', { text: 'waiting for start' });
    expect(data(selected(session)).comment).toBe('waiting for start');
  });
});

describe('LNG-012 sequential function chart palette', () => {
  it('offers every element of the palette of the editor', () => {
    expect(
      paletteChoices()
        .map((item) => item.id)
        .sort(),
    ).toEqual(SFC_PALETTE.map((element) => element.type).sort());
  });

  it('has a command for every key of the table and a key for every command', () => {
    const ids = actionsOf('sfc')
      .map((action) => action.id)
      .sort();
    const commands = [...SFC_MODEL_COMMANDS, ...SFC_EDITOR_COMMANDS].filter((id) => id !== 'insertElement').sort();
    expect(ids).toEqual(commands);
  });
});

describe('UX-033 aligning and distributing steps and transitions from the keyboard', () => {
  const placed = (): Session => {
    const session = start();
    session.state = {
      nodes: [
        {
          id: 'one',
          type: 'step',
          position: { x: 100, y: 0 },
          measured: { width: 100, height: 60 },
          selected: true,
          data: { name: 'One' },
        },
        {
          id: 'two',
          type: 'step',
          position: { x: 160, y: 200 },
          measured: { width: 100, height: 60 },
          selected: true,
          data: { name: 'Two' },
        },
        {
          id: 't1',
          type: 'transition',
          position: { x: 300, y: 100 },
          measured: { width: 120, height: 80 },
          selected: true,
          data: { condition: 'Go' },
        },
      ],
      edges: [],
    };
    return session;
  };

  it('UX-033 aligns the selected steps and transitions in one gesture, and says how many', () => {
    const session = press(placed(), ['Alt+Shift+ArrowLeft']);
    expect(session.state.nodes.map((node) => node.position.x)).toEqual([100, 100, 100]);
    expect(session.commits).toBe(1);
    expect(session.said.at(-1)).toContain('3');
  });

  it('UX-033 refuses to distribute two elements, with the reason, and changes nothing', () => {
    const session = placed();
    session.state.nodes[2]!.selected = false;
    press(session, ['Ctrl+Alt+Shift+V']);
    expect(session.last?.refused).toBe(true);
    expect(session.commits).toBe(0);
  });
});

describe('LNG-012 selecting more than one element of the chart from the keyboard', () => {
  it('LNG-012 extends the selection down the chart and aligns the two elements with keys alone, as one gesture', () => {
    const session = start();
    const at = (id: string, x: number, y: number, selected = false): Node => ({
      id,
      type: 'step',
      position: { x, y },
      measured: { width: 60, height: 20 },
      selected,
      data: { name: id },
    });
    session.state = { nodes: [at('S1', 0, 0, true), at('S2', 80, 100)], edges: [] };
    press(session, ['Ctrl+Alt+ArrowDown']);
    expect(session.state.nodes.filter((node) => node.selected).map((node) => node.id)).toEqual(['S1', 'S2']);
    expect(session.commits).toBe(0);
    press(session, ['Alt+Shift+ArrowLeft']);
    expect(session.state.nodes.map((node) => node.position.x)).toEqual([0, 0]);
    expect(session.commits).toBe(1);
    press(session, ['Ctrl+Alt+A']);
    expect(session.state.nodes.every((node) => node.selected)).toBe(true);
  });
});
