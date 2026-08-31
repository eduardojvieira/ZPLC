import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { claimMotorInputCommand, shouldClearMotorInputFailure } from './liveNativeMotorPanel';

describe('Console tab boundary', () => {
  it('excludes a concurrent motor command and clears a failure only after a newer sample', () => {
    const inFlight = { current: false };
    const failure = { current: null as number | null };
    expect(claimMotorInputCommand(inFlight, failure)).toBe(true);
    expect(claimMotorInputCommand(inFlight, failure)).toBe(false);
    inFlight.current = false;
    failure.current = 202;
    expect(claimMotorInputCommand(inFlight, failure)).toBe(false);
    expect(shouldClearMotorInputFailure(failure.current, 201)).toBe(false);
    expect(shouldClearMotorInputFailure(failure.current, 202)).toBe(false);
    expect(shouldClearMotorInputFailure(failure.current, 203)).toBe(true);
  });

  it('keeps roving tab focus and the four standard navigation keys', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain('tabIndex={activeConsoleTab === tab.id ? 0 : -1}');
    expect(source).toContain("key === 'ArrowLeft'");
    expect(source).toContain("key === 'ArrowRight'");
    expect(source).toContain("key === 'Home'");
    expect(source).toContain("key === 'End'");
    expect(source).toContain('document.getElementById(`console-tab-${nextTab}`)?.focus()');
    expect(source).toContain("id: 'trace'");
    expect(source).toContain("id: 'learn'");
    expect(source).toContain("activeConsoleTab === 'learn'");
    expect(source).toContain('<LearnPanel workspaceTestPresentation={typeof workspaceTestStateForLink === \'object\' ? workspaceTestStateForLink.presentation : undefined} />');
    expect(source).toContain("id: 'explorer'");
    expect(source).toContain("id: 'inspector'");
    expect(source).toContain('<Sidebar />');
    expect(source).toContain('<WorkbenchInspector />');
    expect(source).toContain('aria-label="Workbench panels"');
    expect(source).toContain('Native POSIX host trace. Not hardware or HIL evidence.');
    expect(source).toContain('Native POSIX host trace samples, newest first.');
    expect(source).toContain('scope="col"');
  });

  it('keeps candidate review in the lower ledger with saved-file fences and no physical apply path', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain("id: 'changes'");
    expect(source).toContain("activeConsoleTab === 'changes'");
    expect(source).toContain('<DiffEditor');
    expect(source).toContain('Native POSIX host evidence — not hardware or HIL evidence.');
    expect(source).toContain('No file has been written.');
    expect(source).toContain('workspaceManifestInputRef.current?.click()');
    expect(source.match(/data-workspace-manifest-input/g)).toHaveLength(1);
    expect(source).toContain('readFileContent(file.handle)');
    expect(source).toContain('sha256Text');
    expect(source).toContain('candidateSnapshotIsCurrent(snapshot)');
    expect(source).toContain('workspaceTests.cancel()');
    expect(source).toContain('saveFile(snapshot.fileId)');
    expect(source).toContain('diskHash !== snapshot.beforeSha256');
    expect(source).toContain('presentCandidateChangeSetReview(result, snapshot)');
    expect(source).toContain('candidateReviewBusy.current || !file');
    expect(source).toContain('current.activeFileId === snapshot.fileId');
    expect(source).toContain('isCandidateSTPath(file.path)');
    expect(source).toContain('isCandidateSTPath(activeFile.path)');
    expect(source).toContain('candidateChangeSet && workspaceTests');
    expect(source).toContain('const candidateDesktopReady = Boolean(candidateChangeSet && workspaceTests);');
    expect(source).toContain('!candidateDesktopReady');
    expect(source).toContain('candidateDesktopReady &&');
    expect(source).toContain('Review · {snapshot.path}');
    expect(source).toContain('Saved on disk');
    expect(source).toContain('Current editor buffer');
    expect(source).toContain("artifact.kind === 'zplc' ? 'ZPLC program' : 'Trace'");
    expect(source).toContain('aria-label={`${artifact.kind === \'zplc\' ? \'ZPLC program\' : \'Trace\'} SHA-256 ${artifact.sha256}`}');
    expect(source).toContain('Saved input identity SHA-256 ${presentation.savedTestInputIdentity.sha256}');
    expect(source).toContain('scrollBeyondLastLine: false');
    expect(source).toContain('renderSideBySide: true');
    expect(source).toContain("state.kind === 'running' || state.kind === 'cancelling' ? { kind: 'stale' }");
    expect(source).toContain("Candidate is no longer current. Review again.");
    expect(source).toContain("setCandidateReviewState({ kind: 'saving' })");
    expect(source).toContain('Review itself does not write files.');
    expect(source).toContain('Open a saved project folder to review a change.');
    expect(source).not.toContain('candidateChangeSet.apply');
    expect(source).not.toMatch(/candidateChangeSet\.(flash|deploy|force|run|stop)/);
    expect(source).not.toMatch(/provider|\bLLM\b|\bMCP\b|graph JSON/i);
  });

  it('labels live ST syntax separately from canonical build diagnostics', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain('Live ST syntax · not build evidence');
    expect(source).toContain('Latest build diagnostics');
    expect(source).toContain('Build to check project diagnostics');
    expect(source).toContain('stBufferDiagnostics.compilerRunId === compilerRunId');
  });

  it('keeps declared interlock coverage inside Problems with saved-session fences and no physical claim', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');
    expect(source).toContain('Declared interlock coverage');
    expect(source).toContain('Check declared interlocks');
    expect(source).toContain('Missing exact NEVER coverage');
    expect(source).toContain('Checks exact NEVER coverage in saved scenarios. It does not establish physical safety, timing, or certification.');
    expect(source).toContain('workspaceTests.safetyCheck({ workspaceId })');
    expect(source).toContain('presentWorkspaceSafetyCheck(result)');
    expect(source).toContain('isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })');
    expect(source).toContain('Save the project and choose zplc.json in Tests to check declared interlocks.');
    expect(source).not.toContain('workspaceTests.safetyCheck({ workspaceId, path');
    expect(source).not.toMatch(/safetyCheck\.(flash|deploy|force|run|stop|shell)/);
    expect(source).toContain("let published = false;");
    expect(source).toContain("setWorkspaceSafetyState({ status: 'running', projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })");
    expect(source).toContain("'status' in workspaceSafetyState ? workspaceSafetyState.status : workspaceSafetyState");
    expect(source).toContain("typeof state === 'object' && 'status' in state && state.status === 'running' ? 'idle' : state");
  });

  it('keeps workspace tests bound to the current local project session', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain('registerProjectFile(file)');
    expect(source).toContain('isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)');
    expect(source).toContain('current.hasUnsavedChanges()');
    expect(source).toContain('isWorkspaceTestRunCurrent(latest, { projectSession: expectedProjectSession, compilerRunId: expectedCompilerRunId, workspaceId })');
    expect(source).toContain("Choose zplc.json");
    expect(source).toContain("Relink zplc.json");
    expect(source).toContain("Linked saved workspace ready for host scenarios.");
    expect(source).toContain("Select the saved workspace zplc.json whose scenarios you want to run.");
    expect(source).toContain('type="file"');
    expect(source).toContain('data-workspace-manifest-input');
    expect(source).toContain('hidden');
    expect(source).toContain('tabIndex={-1}');
    expect(source).toContain('aria-hidden="true"');
    expect(source).not.toContain('aria-label="Choose saved workspace zplc.json"');
    expect(source).toContain('input.value = \'\';');
    expect(source).toContain('Tests use saved workspace files and do not include changes that are not saved.');
    expect(source).toContain('Cancel scenarios');
    expect(source).toContain('Cancelling…');
    expect(source).toContain('workspaceTests.cancel()');
    expect(source).toContain('const runWorkspaceTests = async (scenarioId?: string) => {');
    expect(source).toContain("const request = { workspaceId, ...(scenarioId === undefined ? {} : { scenarioId }) };");
    expect(source).toContain('workspaceTests.run(request)');
    expect(source).toContain('onClick={() => { void runWorkspaceTests(); }}');
    expect(source).toContain('Run this scenario again');
    expect(source).toContain('aria-label={`Run ${scenario.id} again on native POSIX`}');
    expect(source).toContain('onRunScenario={runWorkspaceTests}');
    expect(source).toContain("workspaceTestState !== 'running'");
    expect(source).not.toContain('It may differ from the project open in the editor.');
  });

  it('offers a session-fenced save only while Tests is blocked by unsaved work', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');
    const start = source.indexOf('const saveWorkspaceProject = async () => {');
    const end = source.indexOf('const runWorkspaceTests = async (scenarioId?: string) => {');
    const handler = source.slice(start, end);

    expect(source).toContain('saveAllFiles,');
    expect(source).toContain('saveProjectConfig,');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(handler).toContain('workspaceTestBusy || !current.isProjectOpen || current.isVirtualProject');
    expect(handler).toContain('latest.projectSession !== expectedProjectSession');
    expect(handler).toContain('latest.loadedFiles.values()).some((file) => file.isModified)');
    expect(handler).toContain('latest.hasUnsavedChanges()');
    expect(handler.indexOf('await saveAllFiles();')).toBeLessThan(handler.indexOf('await saveProjectConfig();'));
    expect(handler).not.toContain('workspaceTests.');
    expect(handler).not.toContain('linkWorkspaceScenarios');
    expect(handler).not.toContain('setWorkspaceTestState');
    expect(source).toContain("workspaceTestAvailabilityState === 'unsaved' && (");
    expect(source).toContain('Save project');
    expect(source).toContain('disabled={workspaceTestBusy}');
    expect(source).toContain('Tests use saved workspace files and do not include changes that are not saved.');
    expect(source).not.toContain('window.electronAPI?.saveProject');
  });

  it('keeps recorded scenario evidence in Tests, separate from the live Trace panel', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain('Scenario evidence (recorded test result)');
    expect(source).toContain('Recorded during this host test run. It does not update with the live Trace panel.');
    expect(source).toContain('Recorded assertions for');
    expect(source).toContain('Recorded sampled timeline for');
    expect(source).toContain('workspaceTestStateForLink.presentation');
    expect(source).toContain('compilerRunId');
    expect(source).toContain('presentation.hasEvidence && presentation.artifacts.length > 0');
    expect(source).toContain(') : presentation.hasEvidence ? (');
    expect(source).toContain('This test result remains recorded evidence only.');
    expect(source).toContain('No scenario evidence was recorded; there is no canonical build link.');
    expect(source).toContain('Motor plant · recorded host scenario');
    expect(source).toContain('Conveyor plant · recorded host scenario');
    expect(source).toContain('Pedestrian crossing · recorded host scenario');
    expect(source).toContain('Tank level controller · recorded host scenario');
    expect(source).toContain('role="region"');
    expect(source).toContain('aria-label="Recorded motor plant matrix"');
    expect(source).toContain('data-recorded-conveyor-plant');
    expect(source).toContain('aria-label="Conveyor plant recorded host scenario"');
    expect(source).toContain('aria-label="Recorded conveyor plant matrix"');
    expect(source).toContain('data-recorded-pedestrian-crossing');
    expect(source).toContain('aria-label="Recorded pedestrian crossing matrix"');
    expect(source).toContain('data-recorded-tank-level');
    expect(source).toContain('aria-label="Recorded tank level matrix"');
    expect(source).toContain('focus-visible:outline-[var(--color-accent-blue)]');
    expect(source).toContain("'text-[var(--color-accent-blue)]'");
    expect(source).toContain("'text-[var(--color-accent-green)]'");
    expect(source).toContain("'text-[var(--color-surface-300)]'");
    expect(source).toContain('Command');
    expect(source).toContain('Running');
    expect(source).toContain('At speed');
    expect(source).toContain('Speed');
    expect(source).toContain('Belt command');
    expect(source).toContain('Diverter command');
    expect(source).toContain('Fault lamp');
    expect(source).toContain('Classifier sensor');
    expect(source).toContain('Metal sensor');
    expect(source).toContain('Diverter sensor');
    expect(source).toContain('Jam sensor');
    expect(source).toContain('Classified count');
    expect(source).toContain('Vehicle');
    expect(source).toContain('Pedestrian');
    expect(source).toContain('Request');
    expect(source).toContain('Plant');
    expect(source).toContain('Request ${sample.request} at ${sample.atMs} ms');
    expect(source).toContain('Plant ${sample.phase} at ${sample.atMs} ms');
    expect(source).toContain('Pump');
    expect(source).toContain('Alarm');
    expect(source).toContain('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    expect(source).toContain("open={presentation.kind === 'assertion-failed' || presentation.preview.scenarios.some((scenario) => presentRecordedMotorPlant(scenario) || presentRecordedConveyorPlant(scenario) || presentRecordedPedestrianCrossing(scenario) || presentRecordedTankLevel(scenario))}");
    expect(source).not.toContain('Reset plant');
    expect(source).not.toContain('resetPlant');
  });

  it('keeps one observable native motor module inside Trace before allowing closed inputs', () => {
    const source = readFileSync(join(import.meta.dir, 'Console.tsx'), 'utf8');

    expect(source).toContain("activeConsoleTab === 'trace'");
    expect(source).toContain('function LiveNativeMotorPanel');
    expect(source.match(/<section aria-label="Live native POSIX motor"/g)).toHaveLength(1);
    expect(source).toContain('Live native POSIX host motor — not hardware or HIL evidence.');
    expect(source).toMatch(/<LiveNativeMotorPanel\s+adapterType=/);
    expect(source).not.toMatch(/<LiveNativeMotorPanel\s+key=/);
    expect(source).toContain('const controls = output ? presentLiveNativeMotorControls');
    expect(source).toContain("command('motor.start', true)");
    expect(source).toContain("command('motor.stop', true)");
    expect(source).toContain("command('motor.estop', true)");
    expect(source).toContain("command('motor.estop', false)");
    expect(source).toContain('Input command was not confirmed; controls are unavailable until a fresh native snapshot.');
    expect(source).toContain('simulationInputsAuthorized={debugController?.adapter instanceof NativeAdapter && debugController.adapter.supportsSimulationInput}');
    expect(source).toContain("disabled={disabled || controls.eStopAsserted} onClick={() => void command('motor.estop', true)}");
    expect(source).toContain("disabled={disabled || !controls.eStopAsserted} onClick={() => void command('motor.estop', false)}");
    expect(source).toContain('Staging host input; waiting for a fresh native snapshot.');
    expect(source).toContain('const inFlightRef = useRef(false);');
    expect(source).toContain('const failureAtRef = useRef<number | null>(null);');
    expect(source).toContain('claimMotorInputCommand(inFlightRef, failureAtRef)');
    expect(source).toContain('inFlightRef.current = false;');
    expect(source).toContain('const nowMs = Date.now();');
    expect(source).toContain('setFreshnessTick((tick) => tick + 1)');
    expect(source).toContain('shouldClearMotorInputFailure(failureAtRef.current, sample?.receivedAtMs)');
    expect(source).not.toContain('setVirtualInput(inputId');
  });
});
