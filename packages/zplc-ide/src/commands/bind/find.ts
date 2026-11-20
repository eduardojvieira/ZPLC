/**
 * Commands of references and navigation (plan-u2.md: R4 binds go to definition and find all references, P3 back and forward).
 * The target is, in this order: the element a visual editor selected, the cursor of the open text editor, else a located notice.
 */
import { useEffect } from 'react';
import { cursorOfFile } from '../../langsvc/monacoProviders';
import { t } from '../../i18n';
import type { RefTarget } from '../../refs/contracts';
import { openPlace } from '../../refs/openPlace';
import type { ReferenceIndex } from '../../refs/referenceIndex';
import { loadReferenceIndex } from '../../refs/sources';
import { useReferences, type ReferenceAction } from '../../refs/useReferences';
import { useSelection } from '../../shell/useSelection';
import { useIDEStore } from '../../store/useIDEStore';
import { bindCommands } from '../bus';
import { showActivity } from './layout';

/** A name written in a diagram is a variable of that diagram first, else a global of the project. */
function nameTarget(index: ReferenceIndex, file: string, name: string): RefTarget {
  const local: RefTarget = { kind: 'symbol', scope: file, name };
  const found = index.referencesOf(local);
  return found.definition || found.uses.length > 0 ? local : { kind: 'symbol', scope: '', name };
}

/** Does what the person asked for with one target: list its references in the Search view, or open its definition. */
export async function lookUp(action: ReferenceAction, target: RefTarget): Promise<void> {
  if (action === 'definition') {
    const definition = (await loadReferenceIndex()).referencesOf(target).definition;
    if (definition) return openPlace(definition.place);
  }
  showActivity('search');
  await useReferences.getState().find(target);
}

/** The references of a Watch row (`Program.Variable`): the index knows which symbol the row names. */
export async function lookUpWatch(path: string): Promise<void> {
  const target = (await loadReferenceIndex()).targetAt({ kind: 'watch', path });
  if (target) return lookUp('references', target);
  showActivity('search');
  useReferences.getState().say(t('refs.notDeclared', { name: path }));
}

async function run(action: ReferenceAction): Promise<void> {
  const refs = useReferences.getState();
  const said = (notice: string): void => {
    showActivity('search');
    refs.say(notice);
  };
  const selected = useSelection.getState().element;
  let targets: RefTarget[] = [];
  if (selected) {
    if (selected.names.length === 0) return said(t('refs.noVariable'));
    const index = await loadReferenceIndex();
    targets = selected.names.map((name) => nameTarget(index, selected.file, name));
  } else {
    const file = useIDEStore.getState().getActiveFile()?.path;
    const cursor = file ? cursorOfFile(file) : undefined;
    const target =
      file && cursor
        ? (await loadReferenceIndex()).targetAt({ kind: 'text', file, line: cursor.line, column: cursor.column, length: 0 })
        : undefined;
    if (!target) return said(t('refs.nothingSelected'));
    targets = [target];
  }
  if (targets.length > 1) {
    showActivity('search');
    return refs.choose(action, targets);
  }
  await lookUp(action, targets[0]!);
}

export function useFindCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'edit.goToDefinition': () => run('definition'),
        'edit.findAllReferences': () => run('references'),
      }),
    [],
  );
}
