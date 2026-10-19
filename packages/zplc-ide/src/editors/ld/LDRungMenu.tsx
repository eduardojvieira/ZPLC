/**
 * The context menu of a rung (UX-033): right click, the context-menu key or Shift+F10 on the rung opens it. The rung is
 * selected first, so the menu acts on the rung it was opened on, and each item runs the command of the key table.
 */

import type { ReactNode } from 'react';
import { ContextMenu } from '../../ui';
import { t } from '../../i18n';
import { rungMenuItems } from '../contextMenus';

interface Props {
  rungId: string;
  index: number;
  count: number;
  readOnly: boolean;
  /** Something has been copied. */
  canPaste: boolean;
  /** Selects the rung, before the menu opens. */
  onOpen: (rungId: string) => void;
  /** Runs a command of the key table on the rung. */
  onCommand: (command: string, rungId: string) => void;
  children: ReactNode;
}

export function LDRungMenu({ rungId, index, count, readOnly, canPaste, onOpen, onCommand, children }: Props) {
  const items = rungMenuItems({ index, count, readOnly, canPaste, run: (command) => onCommand(command, rungId) });
  return (
    <ContextMenu label={t('editor.menu.rung')} className="contents" items={items}>
      <div onContextMenuCapture={() => onOpen(rungId)}>{children}</div>
    </ContextMenu>
  );
}
