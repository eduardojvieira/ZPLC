/**
 * The context menus of the function block and the sequential function chart editors (UX-033): what the menu of the
 * canvas, of an element and of a wire offers, built on the kit's menu items. An item runs the command of the key table
 * that has its name, so a menu and a key cannot do different things, and the key it shows is the table's. An item that
 * cannot run is disabled and says why, instead of being left out.
 */

import type { MenuItem } from '../ui';
import { t } from '../i18n';
import { ARRANGE_COMMANDS, arrangeReason, type ArrangeCommand } from './arrange';
import { actionsOf } from './keymap';

export type MenuTargetKind = 'canvas' | 'node' | 'edge';

export interface CanvasMenuContext {
  editor: 'fbd' | 'sfc';
  target: MenuTargetKind;
  selectedNodes: number;
  selectedEdges: number;
  readOnly: boolean;
  /** Something has been copied. */
  canPaste: boolean;
  run: (command: string) => void;
  /** The block under the menu is a function block instance whose values can be watched. */
  instanceMonitor?: () => void;
}

export function canvasMenuItems(context: CanvasMenuContext): MenuItem[] {
  const { editor, target, selectedNodes, selectedEdges, readOnly, canPaste, run, instanceMonitor } = context;
  const item = (id: string, label: string, over: Partial<MenuItem> = {}): MenuItem => ({
    id,
    label,
    shortcut: actionsOf(editor).find((action) => action.id === id)?.keys[0],
    onSelect: () => run(id),
    ...over,
  });
  const unless = (reason: string | undefined): Partial<MenuItem> => (reason ? { disabled: true, disabledReason: reason } : {});
  const editing = readOnly ? t('editor.menu.readOnly') : undefined;
  const one = editing ?? (selectedNodes === 1 ? undefined : t('editor.menu.oneElement'));
  const paste = item('pasteSelection', t('editor.menu.paste'), unless(editing ?? (canPaste ? undefined : t('editor.menu.nothingCopied'))));
  const commands = item('showCommands', t('editor.menu.commands'));

  if (target === 'canvas') {
    return [item('openPalette', t('editor.menu.insert'), unless(editing)), paste, item('fitView', t('editor.fit.button')), commands];
  }
  if (target === 'edge') {
    return [
      item('deleteSelection', t('editor.menu.deleteWire'), {
        destructive: true,
        ...unless(editing ?? (selectedEdges > 0 ? undefined : t('editor.menu.nothingSelected'))),
      }),
      commands,
    ];
  }
  return [
    item('bindVariable', editor === 'fbd' ? t('editor.menu.bind.fbd') : t('editor.menu.bind.sfc'), unless(one)),
    item('editComment', t('editor.menu.comment'), unless(one)),
    ...(instanceMonitor
      ? [item('openInstanceMonitor', t('editor.menu.instanceMonitor'), { shortcut: undefined, onSelect: instanceMonitor })]
      : []),
    item('toggleBreakpoint', t('editor.menu.breakpoint'), unless(selectedNodes > 0 ? undefined : t('editor.menu.nothingSelected'))),
    item('copySelection', t('editor.menu.copy'), unless(selectedNodes > 0 ? undefined : t('editor.menu.nothingSelected'))),
    paste,
    item('deleteSelection', t('editor.menu.delete'), {
      destructive: true,
      ...unless(editing ?? (selectedNodes + selectedEdges > 0 ? undefined : t('editor.menu.nothingSelected'))),
    }),
    ...ARRANGE_COMMANDS.map((command: ArrangeCommand, index) =>
      item(command, t(`editor.arrange.${command}`), {
        separatorBefore: index === 0,
        ...unless(editing ?? arrangeReason(selectedNodes, command)),
      }),
    ),
  ];
}

export interface RungMenuContext {
  /** The place of the rung in the list, from 0. */
  index: number;
  count: number;
  readOnly: boolean;
  canPaste: boolean;
  run: (command: string) => void;
}

/** The menu of a rung of the ladder: the commands of the key table that act on the rung, and the fit. */
export function rungMenuItems({ index, count, readOnly, canPaste, run }: RungMenuContext): MenuItem[] {
  const item = (id: string, label: string, over: Partial<MenuItem> = {}): MenuItem => ({
    id,
    label,
    shortcut: actionsOf('ld').find((action) => action.id === id)?.keys[0],
    onSelect: () => run(id),
    ...over,
  });
  const unless = (reason: string | undefined): Partial<MenuItem> => (reason ? { disabled: true, disabledReason: reason } : {});
  const editing = readOnly ? t('editor.menu.readOnly') : undefined;
  return [
    item('addRung', t('editor.menu.addRung'), unless(editing)),
    item('moveRungUp', t('editor.menu.moveRungUp'), unless(editing ?? (index > 0 ? undefined : t('editor.menu.firstRung')))),
    item('moveRungDown', t('editor.menu.moveRungDown'), unless(editing ?? (index < count - 1 ? undefined : t('editor.menu.lastRung')))),
    item('copyRung', t('editor.menu.copyRung')),
    item('pasteRung', t('editor.menu.pasteRung'), unless(editing ?? (canPaste ? undefined : t('editor.menu.nothingCopied')))),
    item('toggleBreakpoint', t('editor.menu.breakpoint')),
    item('deleteRung', t('editor.menu.deleteRung'), { destructive: true, separatorBefore: true, ...unless(editing) }),
    item('fitView', t('editor.fit.button'), { separatorBefore: true }),
  ];
}
