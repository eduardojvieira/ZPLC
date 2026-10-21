import { describe, expect, it } from 'bun:test';

import { createEmptyRung, type LDElement, type LDModel } from '../../models/ld';
import { transpileLDToST } from '../../transpiler/ldToST';
import { actionFor, parseChord } from '../keymap';
import { addBranchAt, bindingChoices, runLDCommand, type LDCursor, type LDOutcome } from './keyboard';

// The keyboard editing of the ladder is a state machine over the document and a cursor: these tests press keys on a model.

const empty = (): LDModel => ({
  name: 'Main',
  variables: {
    inputs: [
      { name: 'Start', type: 'BOOL' },
      { name: 'Stop', type: 'BOOL' },
      { name: 'Level', type: 'INT' },
    ],
    outputs: [{ name: 'Lamp', type: 'BOOL' }],
    local: [{ name: 'Motor', type: 'BOOL' }],
  },
  rungs: [createEmptyRung(1)],
});

interface Session {
  model: LDModel;
  cursor: LDCursor | null;
  said: string[];
  commits: number;
  last?: LDOutcome;
}

const start = (model: LDModel = empty()): Session => ({ model, cursor: null, said: [], commits: 0 });

/**
 * Presses the keys as the editor receives them: a chord goes through the key table to its command, the command runs, and
 * a prompt for a binding is answered with the next name of `answers`.
 */
function press(session: Session, keys: string[], answers: string[] = []): Session {
  const remaining = [...answers];
  for (const chord of keys) {
    const command = actionFor('ld', parseChord(chord));
    if (!command) throw new Error(`${chord} is not bound in the ladder editor`);
    let outcome = runLDCommand(session.model, session.cursor, command);
    session.model = outcome.model;
    session.cursor = outcome.cursor;
    session.said.push(outcome.say);
    if (outcome.changed) session.commits += 1;
    while (outcome.prompt?.kind === 'bind' && remaining.length > 0) {
      outcome = runLDCommand(session.model, session.cursor, 'bindVariable', { variable: remaining.shift()! });
      session.model = outcome.model;
      session.cursor = outcome.cursor;
      session.said.push(outcome.say);
      if (outcome.changed) session.commits += 1;
    }
    session.last = outcome;
  }
  return session;
}

const cellOf = (model: LDModel, rung: number, row: number, col: number): LDElement | null => model.rungs[rung]!.grid![row]![col]!.element;
const where = (cursor: LDCursor | null) => cursor && [cursor.rungId, cursor.row, cursor.col];

describe('LNG-012 ladder cursor', () => {
  const twoRungs = (): LDModel => ({
    ...empty(),
    rungs: [
      createEmptyRung(1),
      {
        ...createEmptyRung(2),
        id: 'rung_2',
        gridConfig: { rows: 2, cols: 4, cellWidth: 80, cellHeight: 60 },
        grid: [[0, 1, 2, 3].map(() => ({ element: null, hasWire: true })), [0, 1, 2, 3].map(() => ({ element: null, hasWire: false }))],
      },
    ],
  });

  it('starts on the first cell and moves one cell with the arrows, stopping at the edges', () => {
    const session = start();
    press(session, ['ArrowRight', 'ArrowRight', 'ArrowDown']);
    // the first rung has one row: Down goes to the next cell, which is in the rung below, absent here
    expect(where(session.cursor)).toEqual(['rung_1', 0, 2]);
    press(session, ['Home']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 0]);
    press(session, ['ArrowLeft']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 0]);
    press(session, ['End', 'ArrowRight']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 7]);
  });

  it('goes down into the next rung from the last row and up into the last row of the rung above', () => {
    const session = start(twoRungs());
    press(session, ['ArrowRight', 'ArrowRight', 'ArrowDown']);
    expect(where(session.cursor)).toEqual(['rung_2', 0, 2]);
    press(session, ['ArrowDown']);
    expect(where(session.cursor)).toEqual(['rung_2', 1, 2]);
    press(session, ['ArrowUp', 'ArrowUp']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 2]);
    // from the first rung there is nothing above
    press(session, ['ArrowUp']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 2]);
  });

  it('keeps the column inside a narrower rung and jumps by rung and to the ends of the document', () => {
    const session = start(twoRungs());
    press(session, ['End', 'PageDown']);
    expect(where(session.cursor)).toEqual(['rung_2', 0, 3]);
    press(session, ['PageUp']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 3]);
    press(session, ['Ctrl+End']);
    expect(where(session.cursor)).toEqual(['rung_2', 1, 3]);
    press(session, ['Ctrl+Home']);
    expect(where(session.cursor)).toEqual(['rung_1', 0, 0]);
  });

  it('says where the cursor is and what is in the cell, for a reader that cannot see it', () => {
    const session = start();
    press(session, ['ArrowRight']);
    expect(session.said.at(-1)).toBe('Rung 1, row 1, column 2: empty cell');
    press(session, ['C'], ['Start']);
    expect(session.said.at(-1)).toBe('Bound normally open contact Start.');
    press(session, ['ArrowLeft', 'ArrowRight']);
    expect(session.said.at(-1)).toBe('Rung 1, row 1, column 2: normally open contact Start');
  });

  it('does not change the document when the cursor moves', () => {
    const session = start();
    const before = session.model;
    press(session, ['ArrowRight', 'ArrowDown', 'Home', 'Ctrl+End']);
    expect(session.model).toBe(before);
    expect(session.commits).toBe(0);
  });
});

describe('LNG-012 ladder keyboard authoring', () => {
  it('builds a rung of a contact, an inverted contact and a coil from the keyboard alone, and the build reads it', () => {
    const session = start();
    press(session, ['C', 'ArrowRight', 'N', 'ArrowRight', 'O'], ['Start', 'Stop', 'Lamp']);
    expect([0, 1, 2].map((col) => cellOf(session.model, 0, 0, col)?.type)).toEqual(['contact_no', 'contact_nc', 'coil']);
    expect([0, 1, 2].map((col) => cellOf(session.model, 0, 0, col)?.variable)).toEqual(['Start', 'Stop', 'Lamp']);
    const built = transpileLDToST(session.model);
    expect(built.errors).toEqual([]);
    expect(built.success).toBe(true);
    expect(built.source).toContain('_rung1_result := Start AND NOT Stop;');
    expect(built.source).toContain('Lamp := _rung1_result;');
  });

  it(
    'asks for the variable of a contact or a coil as soon as it is inserted, and leaves it unbound when the question is not ' + 'answered',
    () => {
      const session = start();
      press(session, ['C']);
      expect(session.last?.prompt?.kind).toBe('bind');
      expect(cellOf(session.model, 0, 0, 0)?.type).toBe('contact_no');
      expect(cellOf(session.model, 0, 0, 0)?.variable).toBeUndefined();
      expect(transpileLDToST(session.model).success).toBe(false);
    },
  );

  it('opens the palette with Insert, I and Enter on an empty cell, and inserts what the palette answers at the cursor', () => {
    for (const key of ['Insert', 'I', 'Enter']) {
      const session = start();
      press(session, [key]);
      expect([key, session.last?.prompt?.kind]).toEqual([key, 'palette']);
    }
    const session = start();
    press(session, ['ArrowRight', 'ArrowRight']);
    const outcome = runLDCommand(session.model, session.cursor, 'insertElement', { insert: { type: 'coil_set', category: 'coil' } });
    expect(outcome.changed).toBe(true);
    expect(cellOf(outcome.model, 0, 0, 2)).toMatchObject({ type: 'coil_set', row: 0, col: 2 });
  });

  it('selects the element on Enter, and does not ask the palette', () => {
    const session = start();
    press(session, ['C', 'Enter'], ['Start']);
    expect(session.last?.prompt).toMatchObject({ kind: 'select', rungId: 'rung_1' });
    expect(session.last?.selection?.elementId).toBe(cellOf(session.model, 0, 0, 0)!.id);
  });

  it('refuses to insert into a taken cell, says why, and leaves the document the same object', () => {
    const session = start();
    press(session, ['C'], ['Start']);
    const before = session.model;
    press(session, ['O']);
    expect(session.model).toBe(before);
    expect(session.last?.refused).toBe(true);
    expect(session.said.at(-1)).toContain('The cell is taken by normally open contact Start');
  });

  it('inserts a function block with a name for its instance, declares the instance, and gives the next block the next name', () => {
    const session = start();
    const insert = { type: 'function_block', fbType: 'TON', category: 'function_block' as const };
    let outcome = runLDCommand(session.model, session.cursor, 'insertElement', { insert });
    expect(cellOf(outcome.model, 0, 0, 0)).toMatchObject({ type: 'function_block', fbType: 'TON', instance: 'TON_1' });
    expect(outcome.model.variables.local).toContainEqual({ name: 'TON_1', type: 'TON' });
    expect(outcome.prompt).toBeUndefined();
    const cursor = runLDCommand(outcome.model, outcome.cursor, 'cursorRight');
    outcome = runLDCommand(outcome.model, cursor.cursor, 'insertElement', { insert });
    expect(cellOf(outcome.model, 0, 0, 1)?.instance).toBe('TON_2');
    expect(outcome.model.variables.local.map((variable) => variable.name)).toEqual(['Motor', 'TON_1', 'TON_2']);
  });

  it('gives every inserted element an id that no element of the document has', () => {
    const session = start();
    press(session, ['C', 'ArrowRight', 'C', 'ArrowRight', 'C'], ['Start', 'Stop', 'Motor']);
    const ids = [0, 1, 2].map((col) => cellOf(session.model, 0, 0, col)!.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('is one commit for each command that changes the document and none for the others', () => {
    const session = start();
    press(session, ['C', 'ArrowRight', 'O'], ['Start', 'Lamp']);
    // insert, bind, insert, bind: four changes of the document, and one cursor move
    expect(session.commits).toBe(4);
  });
});

describe('LNG-012 what the keyboard does not do without a cursor to show it', () => {
  const withElement = (): Session => {
    const session = start();
    press(session, ['C'], ['Start']);
    // the cursor is not on a cell: the editor was left, and the document is still there
    session.cursor = null;
    return session;
  };

  it('refuses to delete, move, bind or restructure what the user has not put the cursor on', () => {
    for (const command of [
      'deleteElement',
      'deleteRung',
      'moveElementRight',
      'moveRungDown',
      'bindVariable',
      'widenBranch',
      'narrowBranch',
      'removeBranch',
      'addRow',
    ]) {
      const session = withElement();
      const before = session.model;
      const outcome = runLDCommand(session.model, session.cursor, command);
      expect([command, outcome.refused, outcome.model === before, outcome.changed]).toEqual([command, true, true, false]);
      expect(outcome.say).toContain('The cursor is not on a cell yet');
    }
  });

  it('takes a cursor on a rung that is gone for no cursor', () => {
    const session = withElement();
    const outcome = runLDCommand(session.model, { rungId: 'rung_deleted', row: 0, col: 0 }, 'deleteElement');
    expect(outcome.refused).toBe(true);
    expect(outcome.model).toBe(session.model);
  });

  it('still inserts into the first cell, which it then shows, and adds a rung at the end', () => {
    const session = start();
    const inserted = runLDCommand(session.model, null, 'insertContact');
    expect(inserted.changed).toBe(true);
    expect(inserted.cursor).toEqual({ rungId: 'rung_1', row: 0, col: 0 });
    const added = runLDCommand(session.model, null, 'addRung');
    expect(added.model.rungs.map((rung) => rung.id)).toEqual(['rung_1', 'rung_2']);
  });
});

describe('LNG-012 binding a variable from the declared symbols', () => {
  const withTimer = (): LDModel => {
    const session = start();
    const outcome = runLDCommand(session.model, null, 'insertElement', {
      insert: { type: 'function_block', fbType: 'TON', category: 'function_block' },
    });
    return outcome.model;
  };

  it('offers a contact the BOOL symbols and the BOOL outputs of declared blocks, and no INT', () => {
    const model = withTimer();
    const contact: LDElement = { id: 'c', type: 'contact_no', row: 0, col: 3 };
    const choices = bindingChoices(model, contact);
    const names = choices.items.map((item) => item.label);
    expect(names).toEqual(expect.arrayContaining(['Start', 'Stop', 'Lamp', 'Motor', 'TON_1.Q']));
    expect(names).not.toContain('Level');
    expect(names).not.toContain('TON_1.ET');
    expect(choices.free).toBe(true);
  });

  it('offers a coil the BOOL symbols it can write, which are not the inputs', () => {
    const names = bindingChoices(empty(), { id: 'o', type: 'coil', row: 0, col: 0 }).items.map((item) => item.label);
    expect(names).toEqual(['Lamp', 'Motor']);
  });

  it('offers a function block only the declared variables of its type, and takes no name that is not one', () => {
    const model = withTimer();
    const timer = cellOf(model, 0, 0, 0)!;
    expect(bindingChoices(model, timer)).toMatchObject({ items: [{ label: 'TON_1' }], free: false });
    const refused = runLDCommand(model, { rungId: 'rung_1', row: 0, col: 0 }, 'bindVariable', { variable: 'Motor' });
    expect(refused.refused).toBe(true);
    expect(refused.say).toContain('Motor is not a declared variable of type TON');
    expect(refused.model).toBe(model);
  });

  it('binds the element under the cursor with F2 and refuses when the cell is empty', () => {
    const session = start();
    press(session, ['F2']);
    expect(session.last?.refused).toBe(true);
    press(session, ['C', 'F2'], []);
    expect(session.last?.prompt).toMatchObject({ kind: 'bind' });
    const bound = runLDCommand(session.model, session.cursor, 'bindVariable', { variable: 'Motor' });
    expect(cellOf(bound.model, 0, 0, 0)?.variable).toBe('Motor');
  });
});

describe('LNG-012 ladder structure from the keyboard', () => {
  it('moves an element one cell with Ctrl and the arrows, and the cursor goes with it', () => {
    const session = start();
    press(session, ['C'], ['Start']);
    press(session, ['Ctrl+ArrowRight', 'Ctrl+ArrowRight']);
    expect(cellOf(session.model, 0, 0, 0)).toBeNull();
    expect(cellOf(session.model, 0, 0, 2)).toMatchObject({ type: 'contact_no', variable: 'Start', col: 2 });
    expect(where(session.cursor)).toEqual(['rung_1', 0, 2]);
  });

  it('refuses to move an element onto another one, or off the rung', () => {
    const session = start();
    press(session, ['C', 'ArrowRight', 'C', 'ArrowLeft'], ['Start', 'Stop']);
    const before = session.model;
    press(session, ['Ctrl+ArrowRight']);
    expect(session.model).toBe(before);
    expect(session.said.at(-1)).toContain('The cell is taken by');
    press(session, ['Ctrl+ArrowLeft']);
    expect(session.said.at(-1)).toBe('The element is at the edge of the rung.');
  });

  it('deletes the element under the cursor with Delete or Backspace, and says there is nothing when the cell is empty', () => {
    const session = start();
    press(session, ['C', 'Delete'], ['Start']);
    expect(cellOf(session.model, 0, 0, 0)).toBeNull();
    press(session, ['Backspace']);
    expect(session.last?.refused).toBe(true);
  });

  it('adds a rung after the rung of the cursor with an id that no rung has, even after a rung was deleted', () => {
    const session = start({
      ...empty(),
      rungs: [createEmptyRung(1), { ...createEmptyRung(2), id: 'rung_2' }, { ...createEmptyRung(3), id: 'rung_3' }],
    });
    press(session, ['PageDown', 'Shift+Delete']);
    expect(session.model.rungs.map((rung) => [rung.id, rung.number])).toEqual([
      ['rung_1', 1],
      ['rung_3', 2],
    ]);
    press(session, ['Ctrl+Enter']);
    const ids = session.model.rungs.map((rung) => rung.id);
    expect(new Set(ids).size).toBe(3);
    expect(session.model.rungs.map((rung) => rung.number)).toEqual([1, 2, 3]);
    expect(session.model.rungs[2]!.id).toBe(session.cursor!.rungId);
  });

  it('moves a rung with Alt and Up or Down, renumbering, and refuses at the ends', () => {
    const session = start({ ...empty(), rungs: [createEmptyRung(1), { ...createEmptyRung(2), id: 'rung_2' }] });
    press(session, ['Home', 'Alt+ArrowDown']);
    expect(session.model.rungs.map((rung) => [rung.id, rung.number])).toEqual([
      ['rung_2', 1],
      ['rung_1', 2],
    ]);
    press(session, ['Alt+ArrowDown']);
    expect(session.said.at(-1)).toBe('This is the last rung.');
    press(session, ['Alt+ArrowUp']);
    expect(session.model.rungs.map((rung) => rung.id)).toEqual(['rung_1', 'rung_2']);
  });

  it('starts a parallel branch at the cursor, widens and narrows it, and removes it', () => {
    const session = start();
    press(session, ['ArrowRight', 'B']);
    const rung = session.model.rungs[0]!;
    expect(rung.branches).toHaveLength(1);
    expect(rung.grid).toHaveLength(2);
    const [branch] = rung.branches!;
    expect([branch!.startCol, branch!.endCol]).toEqual([1, 6]);
    press(session, ['Alt+ArrowRight']);
    expect(session.model.rungs[0]!.branches![0]!.endCol).toBe(7);
    press(session, ['Alt+ArrowRight']);
    expect(session.said.at(-1)).toBe('The branch already reaches the last column.');
    press(session, ['Alt+ArrowLeft', 'Alt+ArrowLeft']);
    expect(session.model.rungs[0]!.branches![0]!.endCol).toBe(5);
    press(session, ['Shift+B']);
    expect(session.model.rungs[0]!.branches).toHaveLength(0);
  });

  it('narrows a branch no further than two columns, and not over an element of its parallel path', () => {
    const session = start();
    press(session, ['B']);
    const [branch] = session.model.rungs[0]!.branches!;
    expect([branch!.startCol, branch!.endCol]).toEqual([0, 6]);
    // put a contact on the new row, at the last column of the branch, and try to give that column up
    press(session, ['ArrowDown', 'End', 'ArrowLeft', 'C', 'ArrowUp'], ['Start']);
    press(session, ['Alt+ArrowLeft']);
    expect(session.last?.refused).toBe(true);
    expect(session.said.at(-1)).toContain('An element of the branch is in the column');
  });

  it('refuses a branch command when the cursor is not inside a branch', () => {
    const session = start();
    press(session, ['Home', 'Alt+ArrowRight']);
    expect(session.said.at(-1)).toBe('The cursor is not inside a parallel branch.');
  });

  it('adds a row, and asks for the comment of the rung with Shift+F2', () => {
    const session = start();
    press(session, ['Home', 'Ctrl+Shift+Enter']);
    expect(session.model.rungs[0]!.grid).toHaveLength(2);
    press(session, ['Shift+F2']);
    expect(session.last?.prompt).toEqual({ kind: 'comment', rungId: 'rung_1' });
  });

  it('shares the branch rule with the mouse: a branch started inside another is nested in it', () => {
    const outer = addBranchAt({ ...createEmptyRung(1) }, 0, 0);
    const inner = addBranchAt({ ...outer, grid: outer.grid }, 0, 1);
    expect(inner.branches).toHaveLength(2);
    expect(inner.branches![1]!.parentBranchId).toBe(inner.branches![0]!.id);
  });
});
