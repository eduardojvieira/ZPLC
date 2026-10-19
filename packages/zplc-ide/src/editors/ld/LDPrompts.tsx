/**
 * What the ladder editor asks while it is edited from the keyboard (LNG-012): the element to insert, the variable to
 * bind, the command to run. Each is the search list of the visual editors, filled from the document.
 */

import { t } from '../../i18n';
import { useMemo } from 'react';
import type { LDElement, LDModel } from '../../models/ld';
import type { ProjectBlock } from '../../models/projectBlocks';
import { actionsOf, keysText } from '../keymap';
import SearchList from '../SearchList';
import { freeTextOf, type PickerItem } from '../picker';
import { bindingChoices, type LDInsert } from './keyboard';
import { paletteItems } from './palette';

export type LDAsk = { kind: 'palette' } | { kind: 'bind'; elementId: string } | { kind: 'commands' };

interface LDPromptsProps {
  ask: LDAsk;
  model: LDModel;
  /** The element under the cursor, for a binding. */
  element: LDElement | null;
  projectBlocks: readonly ProjectBlock[];
  onInsert: (item: LDInsert) => void;
  onBind: (name: string) => void;
  onCommand: (id: string) => void;
  onClose: () => void;
}

export default function LDPrompts({ ask, model, element, projectBlocks, onInsert, onBind, onCommand, onClose }: LDPromptsProps) {
  const palette = useMemo(() => paletteItems(projectBlocks), [projectBlocks]);
  const commands = useMemo<PickerItem[]>(
    () => actionsOf('ld').map((action) => ({ id: action.id, label: action.description.en, detail: keysText(action) })),
    [],
  );

  if (ask.kind === 'palette') {
    return (
      <SearchList
        title={t('editors.ld.insertElement')}
        items={palette}
        placeholder={t('editors.ld.searchElements')}
        onChoose={(item) => onInsert(palette.find((candidate) => candidate.id === item.id)!.insert)}
        onCancel={onClose}
      />
    );
  }
  if (ask.kind === 'commands') {
    return <SearchList title={t('editors.ld.commands')} items={commands} placeholder={t('editors.ld.searchCommands')} onChoose={(item) => onCommand(item.id)} onCancel={onClose} />;
  }
  if (!element) return null;
  const choices = bindingChoices(model, element, projectBlocks);
  return (
    <SearchList
      title={choices.title}
      items={choices.items}
      allowFreeText={choices.free}
      freeTextLabel={(text) => t('editors.ld.useUndeclared', { text })}
      placeholder={t('editors.ld.searchSymbols')}
      emptyText={choices.free ? t('editors.ld.noSymbol') : t('editors.ld.noVariable')}
      onChoose={(item) => onBind(freeTextOf(item) ?? item.id)}
      onCancel={onClose}
    />
  );
}
