import { useIDEStore } from '../store/useIDEStore';
import { useT } from '../i18n';
import { PanelEmptyState } from './panelStates';
import { presentWorkbenchInspector } from './workbenchInspectorPresentation';
import { ControllerView } from './ControllerView';

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="ledger-inspector-row">
      <dt>{label}</dt>
      <dd className={mono ? 'font-mono' : undefined}>{value}</dd>
    </div>
  );
}

/** Read-only summary of facts already held in the current project session. */
export function WorkbenchInspector() {
  const { t } = useT();
  const activeFile = useIDEStore((state) => state.getActiveFile());
  const projectName = useIDEStore((state) => state.projectName);
  const target = useIDEStore((state) => state.projectConfig?.target?.board ?? null);
  const connectionStatus = useIDEStore((state) => state.connection.status);
  const controllerBoard = useIDEStore((state) => state.controllerInfo?.board ?? null);
  const compilerMessages = useIDEStore((state) => state.compilerMessages);
  const compilerMessagesChecked = useIDEStore((state) => state.compilerMessagesChecked);
  const forcedValuesCount = useIDEStore((state) => state.debug.forcedValues.size);
  const forcesUnconfirmed = useIDEStore((state) => state.debug.forcesUnconfirmed);
  const nativeTraceCount = useIDEStore((state) => state.debug.nativeTrace.length);
  const summary = presentWorkbenchInspector({
    activeFile,
    projectName,
    target,
    connectionStatus,
    controllerBoard,
    compilerMessages,
    compilerMessagesChecked,
    forcedValuesCount,
    forcesUnconfirmed,
    nativeTraceCount,
  });

  return (
    <aside aria-label={t('workbench.inspector.region')} className="ledger-inspector font-sans">
      <section aria-labelledby="inspector-file">
        <h2 id="inspector-file">{t('workbench.inspector.activeFile')}</h2>
        {summary.file ? (
          <dl>
            <Row label={t('workbench.inspector.name')} value={summary.file.name} mono />
            <Row label={t('workbench.inspector.language')} value={summary.file.language} />
            <Row label={t('workbench.inspector.path')} value={summary.file.path} mono />
          </dl>
        ) : <PanelEmptyState title={t('panel.inspector.empty.title')} description={t('panel.inspector.empty.description')} actionLabel={t('panel.inspector.empty.action')} onAction={() => useIDEStore.getState().setActiveConsoleTab('explorer')} />}
      </section>
      <section aria-labelledby="inspector-project">
        <h2 id="inspector-project">{t('workbench.inspector.project')}</h2>
        <dl>
          <Row label={t('workbench.inspector.project')} value={summary.project} />
          <Row label={t('workbench.inspector.target')} value={summary.target} mono />
          <Row label={t('workbench.inspector.device')} value={summary.device} />
        </dl>
      </section>
      <section aria-labelledby="inspector-evidence">
        <h2 id="inspector-evidence">{t('workbench.inspector.evidence')}</h2>
        <dl>
          <Row label={t('workbench.inspector.diagnostics')} value={summary.diagnostics} />
          <Row label={t('workbench.inspector.forces')} value={summary.forces} />
          <Row label={t('workbench.inspector.trace')} value={summary.evidence} />
        </dl>
        <p className="ledger-inspector-note">{t('workbench.inspector.hostTrace')}</p>
      </section>
      {connectionStatus === 'connected' && controllerBoard && <section aria-label={t('workbench.inspector.controller')}><ControllerView /></section>}
    </aside>
  );
}
