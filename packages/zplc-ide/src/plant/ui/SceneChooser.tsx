/**
 * Where a scene comes from, as the plant panel offers it (spec 012 SCN-001, SCN-006, SCN-016): the scene of this project (the
 * `scene.json` at its root and the `scenes/*.scene.json` it holds), the empty floor and each shipped reference scene. A native
 * select, so the keyboard reaches every choice; and the prompt that saves a template into the project under a name.
 */
import { useRef, useState } from 'react';
import { SCENE_INDEX } from '../../generated/sceneIndex';
import { useT } from '../../i18n';
import { Button, Dialog, Select, TextField } from '../../ui';
import { sceneFilePath } from '../persistence/sceneFiles';
import { EMPTY, FILE, PROJECT, refFromValue, type SceneRef } from './usePlantSession';

interface SceneChooserProps {
  value: string;
  /** A `scene.json` sits at the project root. */
  rootScene: boolean;
  /** The names saved under `<project>/scenes/`. */
  saved: readonly string[];
  onChoose: (ref: SceneRef) => void;
}

export function SceneChooser({ value, rootScene, saved, onChoose }: SceneChooserProps) {
  const { t, locale } = useT();
  const hasProject = rootScene || saved.length > 0;
  return (
    <Select label={t('plant.panel.scene')} value={value} onChange={(event) => onChoose(refFromValue(event.target.value))}>
      {hasProject && (
        <optgroup label={t('plant.panel.groupProject')}>
          {rootScene && <option value={PROJECT}>{t('plant.panel.projectScene')}</option>}
          {saved.map((name) => (
            <option key={name} value={`${FILE}${name}`}>
              {name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label={t('plant.panel.groupTemplates')}>
        <option value={EMPTY}>{t('plant.panel.emptyFloor')}</option>
        {SCENE_INDEX.map((scene) => (
          <option key={scene.id} value={scene.id}>
            {scene.names[locale === 'es' ? 'es' : 'en']}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}

/** The name prompt of "Save to project": it refuses a name the project already holds and a name `sceneFilePath` refuses. */
export function SaveSceneButton({
  initialName,
  existing,
  onSave,
}: {
  initialName: string;
  existing: readonly string[];
  onSave: (name: string) => Promise<void>;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();
  const field = useRef<HTMLInputElement>(null);
  const close = () => setOpen(false);
  const submit = async () => {
    try {
      sceneFilePath(name);
      if (existing.includes(name)) return setError(t('plant.panel.saveExists', { name }));
      await onSave(name);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return (
    <>
      <Button
        data-plant-save-scene
        onClick={() => {
          setName(initialName);
          setError(undefined);
          setOpen(true);
        }}
      >
        {t('plant.panel.saveToProject')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('plant.panel.saveTitle')}
        description={t('plant.panel.saveHint', { name })}
        initialFocus={field}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('plant.panel.saveCancel')}
            </Button>
            <Button data-plant-save-confirm onClick={() => void submit()}>
              {t('plant.panel.saveConfirm')}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <TextField
            ref={field}
            label={t('plant.panel.saveName')}
            value={name}
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(undefined);
            }}
          />
        </form>
      </Dialog>
    </>
  );
}
