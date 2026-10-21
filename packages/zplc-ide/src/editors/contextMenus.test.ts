// UX-033: the context menus of the diagram editors name their items, run the commands of the key table, and say why an
// item is disabled.
import { describe, expect, it } from 'bun:test';
import { ARRANGE_COMMANDS, arrangeReason } from './arrange';
import { canvasMenuItems, rungMenuItems, type CanvasMenuContext } from './contextMenus';
import { actionsOf } from './keymap';

const context = (over: Partial<CanvasMenuContext> = {}): CanvasMenuContext & { ran: string[] } => {
  const ran: string[] = [];
  return {
    editor: 'fbd',
    target: 'node',
    selectedNodes: 1,
    selectedEdges: 0,
    readOnly: false,
    canPaste: true,
    run: (command) => {
      ran.push(command);
    },
    ...over,
    ran,
  };
};
const byId = (items: ReturnType<typeof canvasMenuItems>, id: string) => items.find((item) => item.id === id);

describe('UX-033 context menus of the diagram editors', () => {
  it('offers the commands of the element, the clipboard, and all eight alignments on an element', () => {
    const items = canvasMenuItems(context());
    expect(items.map((item) => item.id)).toEqual([
      'bindVariable',
      'editComment',
      'toggleBreakpoint',
      'copySelection',
      'pasteSelection',
      'deleteSelection',
      ...ARRANGE_COMMANDS,
    ]);
    expect(items.every((item) => item.label.trim().length > 0)).toBe(true);
  });

  it('runs the command of the key table when an item is chosen', () => {
    const ctx = context();
    byId(canvasMenuItems(ctx), 'toggleBreakpoint')!.onSelect();
    byId(canvasMenuItems(ctx), 'alignLeft')!.onSelect();
    expect(ctx.ran).toEqual(['toggleBreakpoint', 'alignLeft']);
  });

  it('shows the key of an item as the key table writes it, so the menu and the table cannot disagree', () => {
    const items = canvasMenuItems(context());
    for (const item of items) {
      const action = actionsOf('fbd').find((candidate) => candidate.id === item.id);
      expect(item.shortcut).toBe(action?.keys[0]);
    }
  });

  it('disables an alignment with the reason when fewer than two elements are selected, and a distribution under three', () => {
    const one = canvasMenuItems(context({ selectedNodes: 1 }));
    expect(byId(one, 'alignLeft')).toMatchObject({ disabled: true, disabledReason: arrangeReason(1, 'alignLeft') });
    const two = canvasMenuItems(context({ selectedNodes: 2 }));
    expect(byId(two, 'alignLeft')?.disabled).toBeFalsy();
    expect(byId(two, 'distributeHorizontally')).toMatchObject({
      disabled: true,
      disabledReason: arrangeReason(2, 'distributeHorizontally'),
    });
    expect(byId(canvasMenuItems(context({ selectedNodes: 3 })), 'distributeVertically')?.disabled).toBeFalsy();
  });

  it('disables binding and the comment unless exactly one element is selected', () => {
    const many = canvasMenuItems(context({ selectedNodes: 3 }));
    expect(byId(many, 'bindVariable')).toMatchObject({ disabled: true });
    expect(byId(many, 'bindVariable')?.disabledReason).toBeTruthy();
  });

  it('keeps every item that changes the diagram disabled, with the reason, in a diagram that is read-only', () => {
    const items = canvasMenuItems(context({ readOnly: true, selectedNodes: 3 }));
    for (const id of ['bindVariable', 'editComment', 'pasteSelection', 'deleteSelection', ...ARRANGE_COMMANDS]) {
      expect([id, byId(items, id)?.disabled, Boolean(byId(items, id)?.disabledReason)]).toEqual([id, true, true]);
    }
    // looking is not changing: the breakpoint and the copy stay available
    expect(byId(items, 'toggleBreakpoint')?.disabled).toBeFalsy();
    expect(byId(items, 'copySelection')?.disabled).toBeFalsy();
  });

  it('says that nothing has been copied when the clipboard is empty', () => {
    expect(byId(canvasMenuItems(context({ canPaste: false })), 'pasteSelection')).toMatchObject({ disabled: true });
  });

  it('offers the palette, the paste, the fit and the command list on the empty canvas', () => {
    const items = canvasMenuItems(context({ target: 'canvas', selectedNodes: 0 }));
    expect(items.map((item) => item.id)).toEqual(['openPalette', 'pasteSelection', 'fitView', 'showCommands']);
    expect(byId(items, 'openPalette')?.shortcut).toBe('Insert');
  });

  it('offers deleting the wire on a wire, and names it as a wire', () => {
    const items = canvasMenuItems(context({ target: 'edge', selectedNodes: 0, selectedEdges: 1, editor: 'sfc' }));
    expect(items.map((item) => item.id)).toEqual(['deleteSelection', 'showCommands']);
    expect(byId(items, 'deleteSelection')?.label).toMatch(/wire/i);
  });

  it('names the sequential function chart binding for steps and conditions, not for variables', () => {
    const fbd = byId(canvasMenuItems(context({ editor: 'fbd' })), 'bindVariable')!.label;
    const sfc = byId(canvasMenuItems(context({ editor: 'sfc' })), 'bindVariable')!.label;
    expect(sfc).not.toBe(fbd);
  });

  it('offers the instance monitor on a function block instance, and runs it, without a key', () => {
    let opened = 0;
    const items = canvasMenuItems(
      context({
        instanceMonitor: () => {
          opened += 1;
        },
      }),
    );
    const monitor = byId(items, 'openInstanceMonitor')!;
    expect(monitor.shortcut).toBeUndefined();
    monitor.onSelect();
    expect(opened).toBe(1);
    expect(byId(canvasMenuItems(context()), 'openInstanceMonitor')).toBeUndefined();
  });
});

describe('UX-033 context menu of a rung', () => {
  const rung = (over: Partial<Parameters<typeof rungMenuItems>[0]> = {}) => {
    const ran: string[] = [];
    return {
      ran,
      items: rungMenuItems({
        index: 1,
        count: 3,
        readOnly: false,
        canPaste: true,
        run: (command) => {
          ran.push(command);
        },
        ...over,
      }),
    };
  };

  it('names the commands of the key table that act on a rung, with the keys of the table', () => {
    const { items, ran } = rung();
    expect(items.map((item) => item.id)).toEqual([
      'addRung',
      'moveRungUp',
      'moveRungDown',
      'copyRung',
      'pasteRung',
      'toggleBreakpoint',
      'deleteRung',
      'fitView',
    ]);
    expect(items.map((item) => item.shortcut)).toEqual(
      items.map((item) => actionsOf('ld').find((action) => action.id === item.id)?.keys[0]),
    );
    items.find((item) => item.id === 'copyRung')!.onSelect();
    expect(ran).toEqual(['copyRung']);
  });

  it('disables moving the first rung up and the last rung down, and says why', () => {
    expect(rung({ index: 0 }).items.find((item) => item.id === 'moveRungUp')).toMatchObject({ disabled: true });
    expect(rung({ index: 0 }).items.find((item) => item.id === 'moveRungUp')?.disabledReason).toBeTruthy();
    expect(rung({ index: 2 }).items.find((item) => item.id === 'moveRungDown')).toMatchObject({ disabled: true });
    expect(rung({ index: 1 }).items.find((item) => item.id === 'moveRungDown')?.disabled).toBeFalsy();
  });

  it('keeps what changes the ladder disabled, with the reason, when it is read-only, and the copy and the fit available', () => {
    const { items } = rung({ readOnly: true, canPaste: false });
    for (const id of ['addRung', 'moveRungUp', 'moveRungDown', 'pasteRung', 'deleteRung']) {
      expect([id, items.find((item) => item.id === id)?.disabled, Boolean(items.find((item) => item.id === id)?.disabledReason)]).toEqual([
        id,
        true,
        true,
      ]);
    }
    expect(items.find((item) => item.id === 'copyRung')?.disabled).toBeFalsy();
    expect(items.find((item) => item.id === 'fitView')?.disabled).toBeFalsy();
  });
});
