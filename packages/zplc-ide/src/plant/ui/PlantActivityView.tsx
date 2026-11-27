/**
 * The body of the Plant activity of the rail (SHL-005, plan-u3 P2): the scene of the plant document with a chooser of the empty
 * floor, the shipped scenes and the project's, the parts catalogue while the scene is being edited (PartList, mounted with the
 * props it has in the editor panel) and the signals of the scene with type, direction and binding as text (VIS-003).
 */
import { useMemo } from 'react';
import { currentLocale, useT } from '../../i18n';
import { runCommand } from '../../commands/bus';
import { listIoMap } from '../../runtime/ioMap';
import { useIDEStore } from '../../store/useIDEStore';
import { usePlantDocument } from '../../store/usePlantDocument';
import { Button, EmptyState } from '../../ui';
import { catalogue } from '../core/catalogue';
import type { PlantSignalDef } from '../contracts';
import { freshIdentity } from '../editor/commands';
import { createSceneEditor } from '../editor/model';
import { PartList } from '../editor/PartList';
import { usePlantEdit } from '../editSession';
import { usePlantChoice } from './usePlantChoice';
import { SceneChooser } from './SceneChooser';
import { refValue, useProjectSceneTexts, useProjectScenes } from './usePlantSession';

/** What a signal's binding is, said in words and marked by a glyph (VIS-003: never colour alone). */
function BindingState({ signal, point, found }: { signal: PlantSignalDef; point: string | undefined; found: string | undefined }) {
  const { t } = useT();
  if (point === undefined) return <>{'○ ' + t('plantEditor.unbound')}</>;
  if (found !== undefined && found !== signal.type) return <>{'⚠ ' + t('plant.activity.mismatch', { point, found, type: signal.type })}</>;
  return <>{'● ' + t('plantEditor.bound', { point })}</>;
}

export function PlantActivityView() {
  const { t } = useT();
  const open = usePlantDocument((state) => state.open);
  const shown = usePlantChoice((state) => state.shown);
  const ask = usePlantChoice((state) => state.ask);
  const session = usePlantEdit();
  const rootScene = useProjectSceneTexts().scene !== undefined;
  const saved = useProjectScenes().names;
  const debugMap = useIDEStore((state) => state.debug.debugMap);
  const ioMap = useMemo(() => listIoMap(debugMap), [debugMap]);

  const editing = session.editor && session.mapEditor && shown && session.sceneRef === shown.key ? session : undefined;
  // While editing, the session's scene and map; else the scene the document shows.
  const signals = useMemo(
    () => (editing?.editor ?? (shown ? createSceneEditor(catalogue, shown.scene) : undefined))?.signals() ?? [],
    // `version` changes after every edit of the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing?.editor, editing?.version, shown],
  );
  const bound = editing?.mapEditor?.map().signals ?? shown?.map?.signals ?? {};

  if (!open && !shown)
    return (
      <div role="region" aria-label={t('shell.activity.plant')}>
        <EmptyState
          title={t('plant.activity.empty')}
          description={t('plant.activity.emptyHint')}
          action={<Button onClick={() => runCommand('view.showPlant')}>{t('plant.activity.add')}</Button>}
        />
      </div>
    );

  const sceneKey = shown?.key ?? '';
  const state = editing?.editor?.state();
  const locale = currentLocale();
  return (
    <div role="region" aria-label={t('shell.activity.plant')} className="flex flex-col gap-4 p-2">
      {shown && <h3>{t('plant.activity.sceneName', { name: (state?.scene ?? shown.scene).name })}</h3>}
      <SceneChooser
        value={sceneKey}
        rootScene={rootScene}
        saved={saved}
        onChoose={(ref) => {
          if (refValue(ref) !== sceneKey) ask(ref);
        }}
      />
      {editing?.editor && state ? (
        <PartList
          parts={state.scene.parts}
          catalogue={catalogue.list()}
          locale={locale}
          selection={state.selection}
          problems={state.problems}
          disabled={editing.running}
          onSelect={(id) => editing.editor?.select(id)}
          onAdd={(id) => {
            if (editing.running) return;
            editing.editor?.place(freshIdentity(state.scene, { id }).id, id, [0, 0, 0]);
          }}
          onDuplicate={(id) => {
            if (!editing.running) editing.editor?.duplicate(id);
          }}
          onRemove={(id) => {
            if (!editing.running) editing.editor?.remove(id);
          }}
        />
      ) : (
        <p>{t('plant.activity.catalogueHint')}</p>
      )}
      <section aria-labelledby="plant-activity-signals">
        <h3 id="plant-activity-signals">{t('plant.activity.signals')}</h3>
        {signals.length === 0 ? (
          <p>{t('plant.activity.noSignals')}</p>
        ) : (
          <table data-plant-signal-list>
            <thead>
              <tr>
                <th scope="col">{t('plant.activity.colSignal')}</th>
                <th scope="col">{t('plant.activity.colType')}</th>
                <th scope="col">{t('plant.activity.colDirection')}</th>
                <th scope="col">{t('plant.activity.colBinding')}</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => {
                const point = bound[signal.name]?.point;
                const io = point === undefined ? undefined : [...ioMap.inputs, ...ioMap.outputs].find((entry) => entry.path === point);
                return (
                  <tr key={signal.name} data-signal={signal.name}>
                    <th scope="row">{signal.name}</th>
                    <td>{signal.type}</td>
                    <td>{signal.direction === 'command' ? t('plantEditor.dirCommand') : t('plantEditor.dirSensor')}</td>
                    <td>
                      <BindingState signal={signal} point={point} found={io?.type} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
