import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';
import { compactSource, withEnglishMessages } from '../i18n/inlineMessages';
import { claimMotorInputCommand, shouldClearMotorInputFailure } from './liveNativeMotorPanel';

// Console.tsx and the modules split out of it (IDE-014): the pins below read the text of all of them, as they did of the one file.
const CONSOLE_MODULES = [
  'Console.tsx',
  'ConsoleTabStrip.tsx',
  'ConsoleReviewPanels.tsx',
  'LiveNativeMotorControls.tsx',
  'WorkspaceTestResult.tsx',
  'console/TestsTab.tsx',
  'console/AgentTab.tsx',
  'console/useWorkspaceTestRunner.ts',
  'reviewFlow.ts',
];
const consoleSources = (): string =>
  CONSOLE_MODULES.map((file) => compactSource(readFileSync(join(import.meta.dir, file), 'utf8'))).join('\n');

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

  it('labels live ST diagnostics separately from canonical build diagnostics', () => {
    // the two lists are drawn by ProblemsPanel (ProblemsPanel.test.tsx); Console keeps the fence that pairs the live list with this build
    const source = withEnglishMessages(consoleSources());

    expect(source).toContain('stBufferDiagnostics.compilerRunId === compilerRunId');
  });

  it('keeps workspace tests bound to the current local project session', () => {
    const source = withEnglishMessages(consoleSources());
    // the run, its save and its cancel moved to the project tests store (U2 T2); the manifest link of the Changes tab stayed
    const store = compactSource(readFileSync(join(import.meta.dir, '../projectTests/useProjectTests.ts'), 'utf8'));

    expect(source).toContain('registerProjectFile(file)');
    expect(source).toContain('isWorkspaceManifestRegistrationCurrent(useIDEStore.getState().projectSession, expectedProjectSession)');
    expect(store).toContain('isWorkspaceTestRunCurrent(useIDEStore.getState(), expected)');
    expect(store).toContain('bridge.run({ workspaceId, ...(target ? { scenarioId: target.id } : {}) })');
    expect(store).toContain('workspaceTests?.cancel()');
    // The chooser is the kit's FileInput: a hidden input (ui/Field.tsx) that the visible button of the Changes tab opens.
    expect(source).toContain('<FileInput');
    expect(source).toContain('data-workspace-manifest-input');
    expect(source).not.toContain('<input');
    expect(source).toContain("input.value = '';");
    expect(source).toContain('Cancel scenarios');
    expect(source).toContain('Cancelling…');
    expect(source).toContain('onClick={() => { void run(); }}');
    expect(source).toContain('Run this scenario again');
    expect(source).toContain('aria-label="Run {id} again on native POSIX"');
    expect(source).not.toContain('It may differ from the project open in the editor.');
  });

  it('keeps recorded scenario evidence in Tests, separate from the live Trace panel', () => {
    const source = withEnglishMessages(consoleSources());

    expect(source).toContain('Scenario evidence (recorded test result)');
    expect(source).toContain('Recorded assertions for');
    expect(source).toContain('Recorded sampled timeline for');
    expect(source).toContain('useWorkspaceTestResult((state) => state.presentation)');
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
    // One focus indicator for every control (UX-005): the global :focus-visible rule, not a class of the panel.
    expect(source).not.toContain('focus-visible:outline');
    // The recorded values use the signal vocabulary (UX-009): ON is the TRUE tone, OFF the neutral one, a lamp or jam the fault tone.
    expect(source).toContain('SIGNAL_TEXT_CLASS.true');
    expect(source).toContain('SIGNAL_TEXT_CLASS.false');
    expect(source).toContain('SIGNAL_TEXT_CLASS.fault');
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
    expect(source).toContain('Request {request} at {atMs} ms');
    expect(source).toContain('Plant {phase} at {atMs} ms');
    expect(source).toContain('Pump');
    expect(source).toContain('Alarm');
    expect(source).toContain('Recorded native POSIX scenario result — not live runtime, hardware, or HIL evidence.');
    expect(source).not.toContain('Reset plant');
    expect(source).not.toContain('resetPlant');
  });

  it('keeps one observable native motor module inside Trace before allowing closed inputs', () => {
    const source = withEnglishMessages(consoleSources());

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
    expect(source).toContain(
      'simulationInputsAuthorized={debugController?.adapter instanceof NativeAdapter && debugController.adapter.supportsSimulationInput}',
    );
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
