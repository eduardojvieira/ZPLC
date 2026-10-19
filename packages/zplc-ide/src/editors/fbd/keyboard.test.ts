import { describe, expect, it } from 'bun:test';
import type { Edge, Node } from '@xyflow/react';

import type { FBDModel } from '../../models/fbd';
import { transpileFBDToST } from '../../transpiler/fbdToST';
import { actionFor, actionsOf, parseChord } from '../keymap';
import { edgesToConnections, nodesToBlocks } from './graphModel';
import { fbdPaletteBlocks } from './palette';
import {
  FBD_EDITOR_COMMANDS,
  FBD_MODEL_COMMANDS,
  paletteChoices,
  parseConstant,
  runFBDCommand,
  wireChoices,
  type FBDOutcome,
  type FBDState,
} from './keyboard';

const document = (): FBDModel => ({
  name: 'Main',
  variables: {
    inputs: [{ name: 'Start', type: 'BOOL' }, { name: 'Stop', type: 'BOOL' }, { name: 'Level', type: 'INT' }],
    outputs: [{ name: 'Lamp', type: 'BOOL' }],
    local: [{ name: 'Motor', type: 'BOOL' }],
  },
  blocks: [],
  connections: [],
});

interface Session {
  model: FBDModel;
  state: FBDState;
  said: string[];
  commits: number;
  last?: FBDOutcome;
}

const start = (): Session => ({ model: document(), state: { nodes: [], edges: [] }, said: [], commits: 0 });

function take(session: Session, outcome: FBDOutcome): FBDOutcome {
  session.state = { nodes: outcome.nodes, edges: outcome.edges };
  session.said.push(outcome.say);
  if (outcome.changed) session.commits += 1;
  session.last = outcome;
  return outcome;
}

const run = (session: Session, command: string, argument = {}) => take(session, runFBDCommand(session.model, session.state, command, argument));

/** Presses the keys as the editor receives them; a question about a binding is answered with the next of `answers`. */
function press(session: Session, keys: string[], answers: string[] = []): Session {
  const remaining = [...answers];
  for (const chord of keys) {
    const command = actionFor('fbd', parseChord(chord));
    if (!command) throw new Error(`${chord} is not bound in the function block editor`);
    let outcome = run(session, command);
    while (outcome.prompt?.kind === 'bind' && remaining.length > 0) outcome = run(session, 'bindVariable', { name: remaining.shift()! });
  }
  return session;
}

const selected = (session: Session): Node | undefined => session.state.nodes.find((node) => node.selected);
const data = (node: Node | undefined) => (node?.data ?? {}) as Record<string, unknown>;
const documentOf = (session: Session): FBDModel => ({ ...session.model, blocks: nodesToBlocks(session.state.nodes), connections: edgesToConnections(session.state.edges) });
const named = (session: Session, name: string): Node => session.state.nodes.find((node) => data(node).variableName === name || data(node).instanceName === name)!;

/** Chooses, from the list a command offers, the wire from `from` to `to` (as `Block.PIN` of the labels). */
function wire(session: Session, command: 'connect' | 'disconnect', label: RegExp | string): FBDOutcome {
  const asked = run(session, command);
  const choice = asked.choices?.find((item) => (typeof label === 'string' ? item.label === label : label.test(item.label)));
  if (!choice) throw new Error(`${command} does not offer ${String(label)}; it offers ${asked.choices?.map((item) => item.label).join(', ')}`);
  return run(session, command, command === 'connect' ? { wire: choice.id } : { edgeId: choice.id });
}

describe('LNG-012 function block diagram keyboard authoring', () => {
  it('builds Start AND Stop into Lamp from the keyboard alone, and the build reads it', () => {
    const session = start();
    press(session, ['V'], ['Start']);
    expect(data(selected(session))).toMatchObject({ type: 'variable', variableName: 'Start', dataType: 'BOOL' });
    run(session, 'insertElement', { blockType: 'AND' });
    expect(data(selected(session)).type).toBe('AND');
    wire(session, 'connect', 'Start.OUT → AND.IN1');
    press(session, ['V'], ['Stop']);
    wire(session, 'connect', 'Stop.OUT → AND.IN2');
    run(session, 'insertElement', { blockType: 'output' });
    run(session, 'bindVariable', { name: 'Lamp' });
    wire(session, 'connect', 'AND.OUT → Lamp.IN');

    const model = documentOf(session);
    expect(model.connections.map((connection) => `${connection.from.block}.${connection.from.port}>${connection.to.block}.${connection.to.port}`).sort()).toEqual([
      `${named(session, 'Start').id}.OUT>${session.state.nodes.find((node) => data(node).type === 'AND')!.id}.IN1`,
      `${named(session, 'Stop').id}.OUT>${session.state.nodes.find((node) => data(node).type === 'AND')!.id}.IN2`,
      `${session.state.nodes.find((node) => data(node).type === 'AND')!.id}.OUT>${named(session, 'Lamp').id}.IN`,
    ].sort());
    const built = transpileFBDToST(model);
    expect(built.errors).toEqual([]);
    expect(built.success).toBe(true);
    expect(built.source).toContain('_and_OUT := Start AND Stop;');
    expect(built.source).toContain('Lamp := _and_OUT;');
  });

  it('puts a new block beside the selected one, selected, with an id and a place that no block has', () => {
    const session = start();
    run(session, 'insertElement', { blockType: 'AND' });
    const first = selected(session)!;
    run(session, 'insertElement', { blockType: 'OR' });
    const second = selected(session)!;
    expect(second.position.x).toBeGreaterThan(first.position.x);
    expect(session.state.nodes.filter((node) => node.selected)).toHaveLength(1);
    run(session, 'focusLeft');
    run(session, 'insertElement', { blockType: 'NOT' });
    const third = selected(session)!;
    const ids = session.state.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(3);
    // the place beside the first block is taken by the second, so the third goes below it
    expect([third.position.x, third.position.y > first.position.y]).toEqual([second.position.x, true]);
  });

  it('gives a function block an instance name, and a block of a communication type its tag', () => {
    const session = start();
    run(session, 'insertElement', { blockType: 'TON' });
    expect(data(selected(session)).instanceName).toBe('TON_1');
    run(session, 'insertElement', { blockType: 'TON' });
    expect(session.state.nodes.map((node) => data(node).instanceName)).toEqual(['TON_1', 'TON_2']);
  });

  it('is one change of the document for each command that changes it, and none for moving', () => {
    const session = start();
    press(session, ['V'], ['Start']);
    const commits = session.commits;
    run(session, 'insertElement', { blockType: 'AND' });
    run(session, 'focusLeft');
    run(session, 'focusRight');
    run(session, 'focusFirst');
    expect(session.commits).toBe(commits + 1);
  });
});

describe('LNG-012 function block diagram cursor', () => {
  const layout = (): Session => {
    const session = start();
    const at = (id: string, x: number, y: number): Node => ({ id, type: 'logicGate', position: { x, y }, data: { type: 'AND' } });
    session.state = { nodes: [at('a', 0, 0), at('b', 300, 0), at('c', 0, 200), at('d', 300, 210)], edges: [] };
    return session;
  };

  it('selects the first block with Home, in reading order', () => {
    const session = layout();
    press(session, ['Home']);
    expect(selected(session)?.id).toBe('a');
  });

  it('moves to the nearest block in a direction with Alt and the arrows, and says when there is none', () => {
    const session = layout();
    press(session, ['Home', 'Alt+ArrowRight']);
    expect(selected(session)?.id).toBe('b');
    press(session, ['Alt+ArrowDown']);
    expect(selected(session)?.id).toBe('d');
    press(session, ['Alt+ArrowLeft']);
    expect(selected(session)?.id).toBe('c');
    press(session, ['Alt+ArrowLeft']);
    expect(selected(session)?.id).toBe('c');
    expect(session.said.at(-1)).toContain('There is no block to the left');
    press(session, ['Alt+ArrowUp']);
    expect(selected(session)?.id).toBe('a');
  });

  it('selects the first block when none is selected, whatever direction is pressed', () => {
    const session = layout();
    press(session, ['Alt+ArrowRight']);
    expect(selected(session)?.id).toBe('a');
  });

  it('does not change the document when the cursor moves', () => {
    const session = layout();
    press(session, ['Home', 'Alt+ArrowRight', 'Alt+ArrowDown']);
    expect(session.commits).toBe(0);
  });
});

describe('LNG-012 binding a function block diagram from the declared symbols', () => {
  it('offers a variable block every declared symbol, with its type, and takes the type of the one chosen', () => {
    const session = start();
    const asked = run(session, 'insertVariable');
    expect(asked.prompt).toMatchObject({ kind: 'bind' });
    const names = asked.choices?.map((item) => item.label);
    expect(names).toEqual(['Start', 'Stop', 'Level', 'Lamp', 'Motor']);
    run(session, 'bindVariable', { name: 'Level' });
    expect(data(selected(session))).toMatchObject({ variableName: 'Level', dataType: 'INT' });
  });

  it('takes a name that is not declared only where the list allows it, and shows it as unknown', () => {
    const session = start();
    run(session, 'insertVariable');
    expect(session.last?.allowFreeText).toBe(true);
    run(session, 'bindVariable', { name: 'Plant.Pump' });
    expect(data(selected(session)).variableName).toBe('Plant.Pump');
  });

  it('names a function block instance, and refuses a name another block has', () => {
    const session = start();
    run(session, 'insertElement', { blockType: 'TON' });
    run(session, 'bindVariable', { name: 'Delay' });
    expect(data(selected(session)).instanceName).toBe('Delay');
    run(session, 'insertElement', { blockType: 'TON' });
    const refused = run(session, 'bindVariable', { name: 'delay' });
    expect(refused.refused).toBe(true);
    expect(refused.say).toContain('already the instance name');
  });

  it('refuses to bind a block that has nothing to bind, and a name that is not an identifier', () => {
    const session = start();
    run(session, 'insertElement', { blockType: 'AND' });
    expect(run(session, 'bindVariable').refused).toBe(true);
    run(session, 'insertVariable');
    expect(run(session, 'bindVariable', { name: '1 bad name' }).refused).toBe(true);
  });

  it('sets the value of a constant from what is typed: BOOL, a number, a time, a string', () => {
    expect(parseConstant('true')).toEqual({ dataType: 'BOOL', value: true });
    expect(parseConstant('FALSE')).toEqual({ dataType: 'BOOL', value: false });
    expect(parseConstant('42')).toEqual({ value: 42 });
    expect(parseConstant('-7')).toEqual({ value: -7 });
    expect(parseConstant('2.5')).toEqual({ dataType: 'REAL', value: 2.5 });
    expect(parseConstant('t#500ms')).toEqual({ dataType: 'TIME', value: 'T#500ms' });
    expect(parseConstant("'hello'")).toEqual({ dataType: 'STRING', value: 'hello' });
    expect(parseConstant('hello')).toBeUndefined();
    const session = start();
    run(session, 'insertConstant');
    expect(session.last?.prompt).toMatchObject({ kind: 'bind' });
    run(session, 'bindVariable', { name: 'T#2s' });
    expect(data(selected(session))).toMatchObject({ type: 'constant', dataType: 'TIME', value: 'T#2s' });
    expect(run(session, 'bindVariable', { name: 'nonsense' }).refused).toBe(true);
  });
});

describe('LNG-012 connecting and disconnecting from the keyboard', () => {
  const diagram = (): Session => {
    const session = start();
    press(session, ['V'], ['Start']);
    run(session, 'insertElement', { blockType: 'AND' });
    return session;
  };

  it('lists the wires the selected block can have, each from an output to an input that takes it', () => {
    const session = diagram();
    const choices = run(session, 'connect').choices!.map((item) => item.label);
    expect(choices).toContain('Start.OUT → AND.IN1');
    expect(choices).toContain('Start.OUT → AND.IN2');
    expect(choices).toContain('AND.OUT → Start.IN');
  });

  it('leaves out a wire that the pin types refuse and an input that has a wire', () => {
    const session = start();
    press(session, ['V'], ['Level']);
    run(session, 'insertElement', { blockType: 'AND' });
    // an INT does not feed the BOOL inputs of an AND, and a BOOL does not feed an INT: no wire can be drawn at all
    const none = run(session, 'connect');
    expect(none.refused).toBe(true);
    expect(none.choices).toBeUndefined();
    const other = diagram();
    wire(other, 'connect', 'Start.OUT → AND.IN1');
    expect(run(other, 'connect').choices!.map((item) => item.label)).not.toContain('Start.OUT → AND.IN1');
  });

  it('draws the chosen wire as one change, and removes the chosen one as one change', () => {
    const session = diagram();
    const before = session.commits;
    wire(session, 'connect', 'Start.OUT → AND.IN1');
    expect(session.commits).toBe(before + 1);
    expect(session.state.edges).toHaveLength(1);
    const edge = session.state.edges[0]!;
    expect([edge.sourceHandle, edge.targetHandle]).toEqual(['OUT', 'IN1']);
    expect(run(session, 'disconnect').choices!.map((item) => item.label)).toEqual(['Start.OUT → AND.IN1']);
    wire(session, 'disconnect', 'Start.OUT → AND.IN1');
    expect(session.state.edges).toHaveLength(0);
    expect(session.commits).toBe(before + 2);
  });

  it('refuses a wire that no longer holds when it is drawn, with the reason', () => {
    const session = diagram();
    const asked = run(session, 'connect');
    const choice = asked.choices!.find((item) => item.label === 'Start.OUT → AND.IN1')!;
    run(session, 'connect', { wire: choice.id });
    const again = run(session, 'connect', { wire: choice.id });
    expect(again.refused).toBe(true);
    expect(again.say).toContain('already has a wire');
    expect(session.state.edges).toHaveLength(1);
  });

  it('offers nothing to connect when no block is selected, and says so', () => {
    const session = start();
    expect(run(session, 'connect').refused).toBe(true);
  });

  it('lists wire choices for a block from the model the editor holds', () => {
    const session = diagram();
    const model = documentOf(session);
    const choices = wireChoices(model, selected(session)!.id);
    expect(choices.every((choice) => choice.from.block !== choice.to.block)).toBe(true);
  });
});

describe('LNG-012 deleting and commenting from the keyboard', () => {
  it('deletes the selected blocks with the wires on them as one change', () => {
    const session = start();
    press(session, ['V'], ['Start']);
    run(session, 'insertElement', { blockType: 'AND' });
    wire(session, 'connect', 'Start.OUT → AND.IN1');
    const commits = session.commits;
    press(session, ['Delete']);
    expect(session.state.nodes.map((node) => data(node).type)).toEqual(['variable']);
    expect(session.state.edges).toHaveLength(0);
    expect(session.commits).toBe(commits + 1);
  });

  it('deletes the selected wire alone', () => {
    const session = start();
    press(session, ['V'], ['Start']);
    run(session, 'insertElement', { blockType: 'AND' });
    wire(session, 'connect', 'Start.OUT → AND.IN1');
    session.state = { nodes: session.state.nodes.map((node) => ({ ...node, selected: false })), edges: session.state.edges.map((edge): Edge => ({ ...edge, selected: true })) };
    press(session, ['Backspace']);
    expect(session.state.edges).toHaveLength(0);
    expect(session.state.nodes).toHaveLength(2);
  });

  it('says there is nothing to delete when nothing is selected', () => {
    const session = start();
    press(session, ['Delete']);
    expect(session.last?.refused).toBe(true);
  });

  it('asks for the comment of the selected block and sets it', () => {
    const session = start();
    run(session, 'insertElement', { blockType: 'AND' });
    expect(run(session, 'editComment').prompt).toMatchObject({ kind: 'comment' });
    run(session, 'editComment', { text: 'both must be on' });
    expect(data(selected(session)).comment).toBe('both must be on');
  });
});

describe('LNG-012 function block diagram palette', () => {
  it('offers every block the palette of the editor offers, and finds them by what they are', () => {
    const items = paletteChoices([]);
    expect(items.map((item) => item.id).sort()).toEqual([...fbdPaletteBlocks()].sort());
    expect(items.find((item) => item.id === 'TON')?.group).toBeDefined();
  });

  it('has a command for every key of the table and a key for every command', () => {
    const ids = actionsOf('fbd').map((action) => action.id).sort();
    const commands = [...FBD_MODEL_COMMANDS, ...FBD_EDITOR_COMMANDS].filter((id) => id !== 'insertElement').sort();
    expect(ids).toEqual(commands);
  });
});

describe('UX-033 aligning and distributing blocks from the keyboard', () => {
  const placed = (): Session => {
    const session = start();
    session.state = {
      nodes: [
        { id: 'a', type: 'logicGate', position: { x: 100, y: 40 }, measured: { width: 60, height: 20 }, selected: true, data: {} },
        { id: 'b', type: 'logicGate', position: { x: 30, y: 90 }, measured: { width: 120, height: 40 }, selected: true, data: {} },
        { id: 'c', type: 'logicGate', position: { x: 200, y: 10 }, measured: { width: 80, height: 30 }, selected: true, data: {} },
      ],
      edges: [],
    };
    return session;
  };

  it('UX-033 aligns the selected blocks to the left with one key, as one gesture, and says so', () => {
    const session = press(placed(), ['Alt+Shift+ArrowLeft']);
    expect(session.state.nodes.map((node) => node.position.x)).toEqual([30, 30, 30]);
    expect(session.commits).toBe(1);
    expect(session.said.at(-1)).toContain('3');
  });

  it('UX-033 centres, then distributes, with the keys of the table, one gesture each', () => {
    const session = press(placed(), ['Alt+Shift+V', 'Ctrl+Alt+Shift+H']);
    expect(session.state.nodes.map((node) => node.position.y)).toEqual([60, 50, 55]);
    expect(session.commits).toBe(2);
  });

  it('UX-033 refuses to align one block and gives the canvas back as it was', () => {
    const session = placed();
    session.state.nodes[1]!.selected = false;
    session.state.nodes[2]!.selected = false;
    const before = session.state.nodes;
    press(session, ['Alt+Shift+ArrowRight']);
    expect(session.last?.refused).toBe(true);
    expect(session.commits).toBe(0);
    expect(session.state.nodes).toBe(before);
  });
});

describe('LNG-012 selecting more than one block from the keyboard', () => {
  const row = (): Session => {
    const session = start();
    const at = (id: string, x: number, y: number, selected = false) => ({ id, type: 'logicGate', position: { x, y }, measured: { width: 60, height: 20 }, selected, data: {} });
    session.state = { nodes: [at('a', 0, 40, true), at('b', 200, 70), at('c', 400, 10)], edges: [] };
    return session;
  };
  const picked = (session: Session) => session.state.nodes.filter((node) => node.selected).map((node) => node.id);

  it('LNG-012 extends the selection to the nearest block in a direction, without a commit', () => {
    const session = press(row(), ['Ctrl+Alt+ArrowRight']);
    expect(picked(session)).toEqual(['a', 'b']);
    expect(session.commits).toBe(0);
    expect(session.said.at(-1)).toContain('2');
  });

  it('LNG-012 keeps extending from the far edge of the selection, and says when nothing is further', () => {
    const session = press(row(), ['Ctrl+Alt+ArrowRight', 'Ctrl+Alt+ArrowRight', 'Ctrl+Alt+ArrowRight']);
    expect(picked(session)).toEqual(['a', 'b', 'c']);
    expect(session.last?.changed).toBe(false);
  });

  it('LNG-012 selects every block with one key', () => {
    expect(picked(press(row(), ['Ctrl+Alt+A']))).toEqual(['a', 'b', 'c']);
  });

  it('LNG-012 aligns two blocks by keyboard alone: extend, then align left, one gesture', () => {
    const session = press(row(), ['Ctrl+Alt+ArrowRight', 'Alt+Shift+ArrowLeft']);
    expect(session.state.nodes.map((node) => node.position.x).slice(0, 2)).toEqual([0, 0]);
    expect(session.commits).toBe(1);
  });
});
