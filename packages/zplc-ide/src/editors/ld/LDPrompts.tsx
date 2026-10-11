/**
 * What the ladder editor asks while it is edited from the keyboard (LNG-012): the element to insert, the variable to
 * bind, the command to run. Each is the search list of the visual editors, filled from the document.
 */

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
        title="Insert element"
        items={palette}
        placeholder="Type to search: contact, coil, TON, branch"
        onChoose={(item) => onInsert(palette.find((candidate) => candidate.id === item.id)!.insert)}
        onCancel={onClose}
      />
    );
  }
  if (ask.kind === 'commands') {
    return <SearchList title="Commands of the ladder editor" items={commands} placeholder="Type to search the commands" onChoose={(item) => onCommand(item.id)} onCancel={onClose} />;
  }
  if (!element) return null;
  const choices = bindingChoices(model, element, projectBlocks);
  return (
    <SearchList
      title={choices.title}
      items={choices.items}
      allowFreeText={choices.free}
      freeTextLabel={(text) => `Use ${text}, which is not declared here`}
      placeholder="Type to search the declared symbols"
      emptyText={choices.free ? 'No declared symbol fits: type a name.' : `No variable of this type is declared in the file.`}
      onChoose={(item) => onBind(freeTextOf(item) ?? item.id)}
      onCancel={onClose}
    />
  );
}
