/**
 * Commands that create and change objects from the navigator (SHL-013): `project.new*` ask for a name and create the object,
 * `project.rename`, `project.moveFile` and `project.delete` ask about the item the navigator's menu named (or the open file),
 * `project.duplicate` copies it, and `file.closeProject` is the close handler that the Explorer's cross used to own.
 */
import { useEffect } from 'react';
import { t } from '../../i18n';
import { askItem, askNew, closeProjectCommand, commandSubject, type ItemOperation } from '../../navigator/navigatorRequests';
import type { ObjectKind } from '../../project/newObject';
import { useIDEStore } from '../../store/useIDEStore';
import { useShellLayout } from '../../store/useShellLayout';
import { bindCommands } from '../bus';

/** The navigator hosts the dialogs, so a command shows it first. */
const showNavigator = (): void => useShellLayout.getState().showActivity('project');

const create = (kind: ObjectKind) => (): void => {
  showNavigator();
  askNew(kind);
};

const item = (operation: ItemOperation) => (): void => {
  const subject = commandSubject();
  if (!subject) return;
  showNavigator();
  askItem(operation, subject);
};

function duplicate(): void {
  const subject = commandSubject();
  if (subject?.kind !== 'path') return;
  void useIDEStore
    .getState()
    .duplicateEntry(subject.path)
    .catch((error: unknown) => {
      useIDEStore.getState().addConsoleEntry({
        type: 'error',
        message: error instanceof Error ? error.message : t('newObject.duplicateFailed'),
        source: 'system',
      });
    });
}

export function useNavigatorCommands(): void {
  useEffect(
    () =>
      bindCommands({
        'project.newProgram': create('program'),
        'project.newFunctionBlock': create('functionBlock'),
        'project.newFunction': create('function'),
        'project.newDataType': create('dataType'),
        'project.newGlobals': create('globals'),
        'project.newTask': create('task'),
        'project.rename': item('rename'),
        'project.moveFile': item('move'),
        'project.delete': item('delete'),
        'project.duplicate': duplicate,
        'file.closeProject': closeProjectCommand,
      }),
    [],
  );
}
