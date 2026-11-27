import { useIDEStore } from '../store/useIDEStore';
import { useT } from '../i18n';
import { describeElementInUi } from '../models/sourceElements';
import { statusOf, useProjectTests } from '../projectTests/useProjectTests';
import { useSelection } from '../shell/useSelection';
import { PanelEmptyState } from './panelStates';
import { presentActiveDocument } from './workbenchInspectorPresentation';
import { ControllerView } from './ControllerView';
import { usePlantEdit } from '../plant/editSession';
import { PlantPartInspector } from './PlantPartInspector';

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ledger-inspector-row">
      <dt>{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}

/**
 * The properties of the current selection (SHL-009): the active document, the selected element of a visual editor, the selected test
 * and the connected board. It repeats nothing of the status rail (project, target, connection, counts). It is read-only except for the
 * part of a plant scene being edited: any other property is changed in the editor that owns it, so every change goes through that
 * document's undo history.
 */
export function WorkbenchInspector() {
  const { t, tn } = useT();
  const activeFile = useIDEStore((state) => state.getActiveFile());
  const connectionStatus = useIDEStore((state) => state.connection.status);
  const controllerBoard = useIDEStore((state) => state.controllerInfo?.board ?? null);
  const projectSession = useIDEStore((state) => state.projectSession);
  const compilerRunId = useIDEStore((state) => state.compilerRunId);
  const element = useSelection((state) => state.element);
  const testPath = useSelection((state) => state.test);
  const test = useProjectTests((state) => (testPath === null ? undefined : state.tests.find((candidate) => candidate.path === testPath)));
  const record = useProjectTests((state) => (testPath === null ? undefined : state.records[testPath]));
  const editingPart = usePlantEdit((s) => {
    const state = s.editor?.state();
    return Boolean(state?.scene.parts.some((p) => p.id === state.selection));
  });
  const document = activeFile ? presentActiveDocument(activeFile) : null;

  return (
    <aside aria-label={t('workbench.inspector.region')} className="ledger-inspector font-sans">
      <section aria-labelledby="inspector-document">
        <h2 id="inspector-document">{t('inspector.document')}</h2>
        {activeFile && document ? (
          <dl>
            <Row label={t('inspector.documentLanguage')} value={document.language} />
            {document.pous.length > 0 && <Row label={t('inspector.documentPous')} value={document.pous.join(', ')} mono />}
            <Row
              label={t('inspector.documentSize')}
              value={t('inspector.documentSizeValue', { lines: document.lines, characters: document.characters })}
            />
            <Row
              label={t('inspector.documentSaved')}
              value={document.saved ? t('inspector.documentSavedYes') : t('inspector.documentSavedNo')}
            />
          </dl>
        ) : (
          <PanelEmptyState
            title={t('panel.inspector.empty.title')}
            description={t('panel.inspector.empty.description')}
            actionLabel={t('panel.inspector.empty.action')}
            onAction={() => useIDEStore.getState().setActiveConsoleTab('explorer')}
          />
        )}
      </section>
      <section aria-labelledby="inspector-element">
        <h2 id="inspector-element">{t('inspector.element')}</h2>
        {element ? (
          <dl>
            <Row label={t('inspector.elementKind')} value={describeElementInUi(element.element)} />
            {element.names.length > 0 && <Row label={t('inspector.elementNames')} value={element.names.join(', ')} mono />}
            <Row label={t('inspector.elementFile')} value={element.file} mono />
          </dl>
        ) : (
          <p className="ledger-inspector-note">{t('inspector.noElement')}</p>
        )}
      </section>
      <PlantPartInspector />
      {testPath !== null && (
        <section aria-labelledby="inspector-test">
          <h2 id="inspector-test">{t('inspector.test')}</h2>
          <dl>
            <Row label={t('inspector.testId')} value={test?.id ?? testPath} mono />
            {test && <Row label={t('inspector.testExpectations')} value={tn('inspector.testExpectationCount', test.expectations.length)} />}
            <Row
              label={t('inspector.testResult')}
              value={t(`inspector.testStatus.${statusOf(record, { projectSession, compilerRunId })}`)}
            />
          </dl>
        </section>
      )}
      {connectionStatus === 'connected' && controllerBoard && (
        <section aria-label={t('workbench.inspector.controller')}>
          <ControllerView />
        </section>
      )}
      {!editingPart && <p className="ledger-inspector-note px-[10px] pb-[10px]">{t('inspector.readOnly')}</p>}
    </aside>
  );
}
