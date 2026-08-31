import { useIDEStore } from '../store/useIDEStore';
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
    <aside aria-label="Workbench inspector" className="ledger-inspector font-sans">
      <section aria-labelledby="inspector-file">
        <h2 id="inspector-file">Active file</h2>
        {summary.file ? (
          <dl>
            <Row label="Name" value={summary.file.name} mono />
            <Row label="Language" value={summary.file.language} />
            <Row label="Path" value={summary.file.path} mono />
          </dl>
        ) : <p>No file selected.</p>}
      </section>
      <section aria-labelledby="inspector-project">
        <h2 id="inspector-project">Project</h2>
        <dl>
          <Row label="Project" value={summary.project} />
          <Row label="Target" value={summary.target} mono />
          <Row label="Device" value={summary.device} />
        </dl>
      </section>
      <section aria-labelledby="inspector-evidence">
        <h2 id="inspector-evidence">Evidence</h2>
        <dl>
          <Row label="Diagnostics" value={summary.diagnostics} />
          <Row label="Forces" value={summary.forces} />
          <Row label="Trace" value={summary.evidence} />
        </dl>
        <p className="ledger-inspector-note">Host trace is not hardware or HIL evidence.</p>
      </section>
      {connectionStatus === 'connected' && controllerBoard && <section aria-label="Connected controller"><ControllerView /></section>}
    </aside>
  );
}
