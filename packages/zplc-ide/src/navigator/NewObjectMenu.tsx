/**
 * Creation and item operations of the project navigator (SHL-013): the "New" button of a group, the questions that the
 * `project.new*`, `project.rename`, `project.moveFile` and `project.delete` commands ask, and the close-project question.
 * The commands (`commands/bind/navigator.ts`) put a request in the store below; `NavigatorDialogs` answers it, so a button,
 * a menu, the palette and a shortcut all end in the same dialog.
 */
import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { useT } from '../i18n';
import { ICON_SIZES } from '../theme/tokens';
import { AlertDialog, Button, IconButton, MenuButton, Select, TextField } from '../ui';
import { Modal } from '../components/Modal';
import { DeleteFolderDialog, EntryNameDialog, MoveDialog } from '../components/ExplorerDialogs';
import { saveAllDocuments } from '../store/saveAll';
import { CloseProjectModal } from '../components/SidebarDialogs';
import { useIDEStore } from '../store/useIDEStore';
import { collectFolders, parentPath } from '../project/treeOperations';
import { createObject, renameTaskRow, type ObjectKind } from '../project/newObject';
import { PLC_LANGUAGES, type FileTreeNode, type PLCLanguage } from '../types';
import { unsavedOutcome } from '../utils/unsavedChanges';
import type { ItemSubject } from './navigatorGroups';
import { askNew, liveCreateContext, nodeOf, useNavigatorRequests, type ItemOperation } from './navigatorRequests';

/**
 * The "New" action of a group: an icon in its header, or the words of the kind in place of "Nothing here yet". A program asks for its
 * language in a menu.
 */
export function NewObjectButton({ kind, groupTitle, words = false }: { kind: ObjectKind; groupTitle: string; words?: boolean }) {
  const { t } = useT();
  const label = words ? t(`newObject.title.${kind}`) : t('newObject.newIn', { group: groupTitle });
  const face = words ? label : <Plus size={ICON_SIZES.sm} aria-hidden="true" />;
  if (kind !== 'program') {
    return words ? (
      <Button variant="ghost" size="sm" onClick={() => askNew(kind)} data-new-object={kind}>
        {label}
      </Button>
    ) : (
      <IconButton size="sm" label={label} icon={face} onClick={() => askNew(kind)} data-new-object={kind} />
    );
  }
  return (
    <MenuButton
      label={label}
      variant="ghost"
      size="sm"
      placement="bottom-end"
      items={(Object.keys(PLC_LANGUAGES) as PLCLanguage[]).map((language) => ({
        id: language,
        label: t(`newObject.language.${language}`),
        onSelect: () => askNew('program', language),
      }))}
    >
      {face}
    </MenuButton>
  );
}

function NewObjectDialog({ kind, initialLanguage, onClose }: { kind: ObjectKind; initialLanguage: PLCLanguage; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(initialLanguage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    createObject(kind, language, name, liveCreateContext())
      .then(onClose)
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : String(caught)))
      .finally(() => setBusy(false));
  };
  return (
    <Modal isOpen onClose={() => !busy && onClose()} title={t(`newObject.title.${kind}`)} widthClass="max-w-md" showCloseButton={!busy}>
      <form className="p-4" onSubmit={submit} data-new-object-dialog>
        <TextField
          id="new-object-name"
          label={t('newObject.name')}
          data-autofocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          error={error ?? undefined}
        />
        {kind === 'program' && (
          <Select
            id="new-object-language"
            label={t('newFile.language')}
            fieldClassName="mt-3"
            value={language}
            onChange={(event) => setLanguage(event.target.value as PLCLanguage)}
          >
            {(Object.keys(PLC_LANGUAGES) as PLCLanguage[]).map((id) => (
              <option key={id} value={id}>
                {t(`newObject.language.${id}`)}
              </option>
            ))}
          </Select>
        )}
        <div className="flex justify-end gap-2 pt-5">
          <Button disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('newObject.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteFileDialog({ node, onDone }: { node: FileTreeNode; onDone: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modified = useIDEStore.getState().loadedFiles.get(node.id)?.isModified === true;
  return (
    <AlertDialog
      open
      title={t('newObject.deleteTitle', { name: node.name })}
      description={t(modified ? 'newObject.deleteBodyModified' : 'newObject.deleteBody', { file: node.path })}
      cancelLabel={t('common.cancel')}
      actionLabel={t('newObject.deleteAction')}
      destructive
      busy={busy}
      onAction={() => {
        setBusy(true);
        void useIDEStore
          .getState()
          .deleteFile(node.id)
          .then((deleted) => (deleted ? onDone() : setError(t('newObject.deleteFailed'))))
          .finally(() => setBusy(false));
      }}
      onCancel={onDone}
    >
      {error && (
        <p role="alert" className="text-sm text-[var(--color-accent-red)]">
          {error}
        </p>
      )}
    </AlertDialog>
  );
}

function ItemDialog({ operation, subject, onDone }: { operation: ItemOperation; subject: ItemSubject; onDone: () => void }) {
  const { t } = useT();
  const store = useIDEStore.getState();
  if (subject.kind === 'task') {
    const task = store.projectConfig?.tasks[subject.index];
    if (!task || operation !== 'rename') return null;
    return (
      <EntryNameDialog
        title={t('newObject.renameTask')}
        initialName={task.name}
        submitLabel={t('common.rename')}
        onSubmit={async (name) => {
          const current = useIDEStore.getState().projectConfig?.tasks ?? [];
          store.updateProjectConfig({ tasks: renameTaskRow(current, subject.index, name) });
          await useIDEStore.getState().saveProjectConfig();
          onDone();
        }}
        onCancel={onDone}
      />
    );
  }
  const node = nodeOf(subject.path);
  const tree = store.fileTree;
  if (!node || !tree) return null;
  if (operation === 'rename') {
    return (
      <EntryNameDialog
        title={t('explorer.renameTitle', { name: node.name })}
        initialName={node.name}
        submitLabel={t('common.rename')}
        onSubmit={async (name) => {
          await store.renameEntry(node.path, name);
          onDone();
        }}
        onCancel={onDone}
      />
    );
  }
  if (operation === 'move') {
    return (
      <MoveDialog
        name={node.name}
        folders={collectFolders(tree, node.type === 'directory' ? node.path : null)}
        initialFolder={parentPath(node.path)}
        onMove={async (folder) => {
          await store.moveEntry(node.path, folder);
          onDone();
        }}
        onCancel={onDone}
      />
    );
  }
  if (node.type === 'file') return <DeleteFileDialog node={node} onDone={onDone} />;
  return (
    <DeleteFolderDialog
      name={node.name}
      modifiedFiles={[...store.loadedFiles.values()]
        .filter((file) => file.isModified && file.path.startsWith(`${node.path}/`))
        .map((file) => file.path)}
      onConfirm={async () => {
        await store.deleteFolder(node.path);
        onDone();
      }}
      onCancel={onDone}
    />
  );
}

function CloseProjectDialog({ onDone }: { onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const afterClose = (closed: boolean): void => {
    onDone();
    if (!closed) requestAnimationFrame(() => document.getElementById('console-tab-watch')?.focus());
  };
  const saveAndClose = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveAllDocuments();
    } catch {
      // The project stays open with what could not be written still modified.
    } finally {
      setSaving(false);
    }
    if (unsavedOutcome('save', useIDEStore.getState().hasUnsavedChanges()) === 'proceed') afterClose(useIDEStore.getState().closeProject());
  };
  return (
    <CloseProjectModal
      isOpen
      busy={saving}
      onSave={() => void saveAndClose()}
      onConfirm={() => afterClose(useIDEStore.getState().closeProject({ discardUnsaved: true }))}
      onCancel={onDone}
    />
  );
}

/** Answers the requests of the commands. Mounted where the navigator is, which a command shows first. */
export function NavigatorDialogs() {
  const creating = useNavigatorRequests((state) => state.creating);
  const operation = useNavigatorRequests((state) => state.operation);
  const closing = useNavigatorRequests((state) => state.closing);
  return (
    <>
      {creating && (
        <NewObjectDialog
          key={`${creating.kind}:${creating.language}`}
          kind={creating.kind}
          initialLanguage={creating.language}
          onClose={() => useNavigatorRequests.setState({ creating: null })}
        />
      )}
      {operation && (
        <ItemDialog
          operation={operation.operation}
          subject={operation.subject}
          onDone={() => useNavigatorRequests.setState({ operation: null })}
        />
      )}
      {closing && <CloseProjectDialog onDone={() => useNavigatorRequests.setState({ closing: false })} />}
    </>
  );
}
