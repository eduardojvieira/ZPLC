/**
 * The New project dialog (IDE-009): the name, the folder, the target and the language of the first program. Create is
 * offered once the name is acceptable and a folder was chosen; the project it makes builds.
 */
import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { Button, Dialog, Select, TextField } from '../ui';
import { useT } from '../i18n';
import { useIDEStore } from '../store/useIDEStore';
import { useNewProjectDialog } from '../store/newProjectDialog';
import { openDirectoryPicker } from '../utils/fileSystem';
import { isWebBuild } from '../platform/webCapabilities';
import { hasBrowserProjectStore, newBrowserProjectFolder } from '../platform/browserProjectStore';
import { PLC_LANGUAGES, type PLCLanguage } from '../types';
import { NEW_PROJECT_LANGUAGES, SIMULATION_TARGET, newProjectTargets, validateProjectName } from '../project/newProject';

function NewProjectForm({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const create = useIDEStore((state) => state.createNewProjectInFolder);
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [folder, setFolder] = useState<FileSystemDirectoryHandle | null>(null);
  // The web build can keep the project in the store of the browser instead of a folder; the folder is made when Create is pressed.
  const [inBrowser, setInBrowser] = useState(false);
  const browserStore = isWebBuild() && hasBrowserProjectStore();
  const [target, setTarget] = useState(SIMULATION_TARGET);
  const [language, setLanguage] = useState<PLCLanguage>('ST');
  const [busy, setBusy] = useState(false);
  const problem = validateProjectName(name);
  const choose = async () => {
    const handle = await openDirectoryPicker().catch(() => null);
    if (!handle) return;
    setFolder(handle);
    setInBrowser(false);
    // until the person types a name, the project is named after the folder
    if (!nameEdited) setName(handle.name);
  };
  const submit = async () => {
    if ((!folder && !inBrowser) || problem) return;
    setBusy(true);
    const handle = inBrowser ? await newBrowserProjectFolder(name.trim()).catch(() => null) : folder;
    const made = handle ? await create({ handle, name: name.trim(), target, language }) : false;
    setBusy(false);
    if (made) onClose();
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <TextField
        data-new-project="name"
        label={t('project.new.name')}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setNameEdited(true);
        }}
        error={nameEdited && problem ? t(`project.new.name.${problem}`) : undefined}
      />
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm" data-testid="new-project-folder">
          {inBrowser ? t('web.store.keep') : folder ? folder.name : t('project.new.noFolder')}
        </span>
        {'showDirectoryPicker' in window || !browserStore ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void choose();
            }}
          >
            <FolderOpen size={14} aria-hidden="true" />
            {t('project.new.chooseFolder')}
          </Button>
        ) : null}
        {browserStore ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-new-project="keep-in-browser"
            tooltip={t('web.store.keepHint')}
            onClick={() => {
              setInBrowser(true);
              setFolder(null);
            }}
          >
            {t('web.store.keep')}
          </Button>
        ) : null}
      </div>
      <Select data-new-project="target" label={t('project.new.target')} value={target} onChange={(event) => setTarget(event.target.value)}>
        {newProjectTargets().map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.value === SIMULATION_TARGET ? t('project.new.simulation') : entry.label}
          </option>
        ))}
      </Select>
      <Select
        data-new-project="language"
        label={t('project.new.language')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as PLCLanguage)}
      >
        {NEW_PROJECT_LANGUAGES.map((entry) => (
          <option key={entry} value={entry}>
            {PLC_LANGUAGES[entry].fullName}
          </option>
        ))}
      </Select>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={(!folder && !inBrowser) || problem !== null || busy}>
          {t('project.new.create')}
        </Button>
      </div>
    </form>
  );
}

export function NewProjectDialog() {
  const { t } = useT();
  const { open, hide } = useNewProjectDialog();
  return (
    <Dialog open={open} onClose={hide} title={t('welcome.new.title')} description={t('project.new.description')} size="md">
      {open && <NewProjectForm onClose={hide} />}
    </Dialog>
  );
}
