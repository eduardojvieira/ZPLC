/**
 * The deploy to a real device, from the checked program to the result (COM-028): preflight against what the device
 * reports, the confirmation dialog (UX-019), the check that nothing changed while the person decided, the transfer and
 * its outcome. The toolbar, the menu, the palette and the keyboard all reach it through one handler, and the dialog is
 * the only way past the preflight: no other path starts a transfer (AGENTS.md rule 7).
 */
import type { DebugMap } from '../compiler';
import { DEVICE_ADMISSION_CODE, DeviceAdmissionError } from '../runtime/deviceHandshake';
import { useNotifications } from '../store/notifications';
import { confirmDeploy, showDeployRefusal } from './deployConfirm';
import {
  HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE,
  nextProgramLoadStateAfterDeploy,
  PROGRAM_LOAD_STATE,
  type LastCompileResult,
} from './debugSessionState';
import { createHardwareDeployConfirmation, gatherDeployFacts } from './hardwareDeployConfirmation';
import { selectRuntimeArtifact } from './runtimeArtifactSelection';

type LoadState = (typeof PROGRAM_LOAD_STATE)[keyof typeof PROGRAM_LOAD_STATE];

export interface DeployDeps {
  /** The build that was current when the person started the deploy. */
  result: LastCompileResult;
  /** The PLC is running or paused: the deploy stops it first, and the dialog says so. */
  running: boolean;
  /** Which project is open and the board it targets, read now and again after the confirmation. */
  project: () => { session: unknown; board: string | undefined; name: string | null };
  currentResult: () => LastCompileResult | null;
  /** The run id of the newest build. */
  compilerRunId: () => number;
  compileRevision: () => number;
  systemInfo: () => unknown;
  loadProgram: (data: Uint8Array, debugMap: DebugMap, board?: string) => Promise<void>;
  setProgramLoadState: (state: LoadState) => void;
  log: (entry: { type: 'info' | 'success' | 'warning' | 'error'; message: string; source: 'runtime' }) => void;
}

export async function performHardwareDeploy(deps: DeployDeps): Promise<void> {
  const { result, log } = deps;
  const notices = useNotifications.getState();
  const started = deps.project();
  let programSendStarted = false;
  let deployOperation = '';
  try {
    const deployedRevision = result.revision;
    const deployedCompilerRunId = result.compilerRunId;
    const dataToUpload = selectRuntimeArtifact({ bytecode: result.bytecode, zplcFile: result.zplcFile });
    const input = { bytecode: dataToUpload, projectBoard: started.board, projectName: started.name, systemInfo: deps.systemInfo(), taskCount: result.taskCount };
    let confirmation;
    try {
      confirmation = await createHardwareDeployConfirmation(input);
    } catch (refusal) {
      // Say what does not match before the refusal is reported, so the person sees the rows and not only a sentence.
      if (refusal instanceof DeviceAdmissionError) await showDeployRefusal(await gatherDeployFacts(input), refusal.detail);
      throw refusal;
    }
    if (!await confirmDeploy(confirmation, deps.running)) {
      log({ type: 'info', message: 'Hardware deploy cancelled; no program was sent.', source: 'runtime' });
      notices.report({ kind: 'deploy', status: 'cancelled', title: 'Deploy cancelled', detail: 'No program was sent.', details: 'output' });
      return;
    }
    const now = deps.project();
    if (deps.currentResult() !== result || now.session !== started.session || now.board !== started.board) {
      log({ type: 'warning', message: 'Project changed before deploy confirmation. Build the current source before deploying.', source: 'runtime' });
      notices.report({ kind: 'deploy', status: 'warning', title: 'Deploy refused', detail: 'The project changed before you confirmed. Build the current source before deploying.', details: 'output' });
      return;
    }

    const description = `Deploying admitted .zplc (${confirmation.byteLength} bytes, ${confirmation.taskCount} task(s)); execution remains stopped...`;
    log({ type: 'info', message: description, source: 'runtime' });
    programSendStarted = true;
    deployOperation = notices.begin({ kind: 'deploy', title: 'Deploying program', detail: description, details: 'output' });
    await deps.loadProgram(dataToUpload, result.debugMap, started.board);
    if (nextProgramLoadStateAfterDeploy(deployedRevision, deps.compileRevision(), deployedCompilerRunId, deps.compilerRunId()) === PROGRAM_LOAD_STATE.LOADED) {
      deps.setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
      log({ type: 'success', message: 'Program deployed and stopped.', source: 'runtime' });
      notices.finish(deployOperation, { kind: 'deploy', status: 'success', title: 'Program deployed and stopped', details: 'output' });
    } else {
      deps.setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
      log({ type: 'warning', message: 'Device received an earlier build. Deploy the current build before Run.', source: 'runtime' });
      notices.finish(deployOperation, { kind: 'deploy', status: 'warning', title: 'Device received an earlier build', detail: 'Deploy the current build before Run.', details: 'output' });
    }
  } catch (error) {
    const preflightDenied = error instanceof DeviceAdmissionError && error.code !== DEVICE_ADMISSION_CODE.RESULT_UNKNOWN;
    deps.setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
    const failure = programSendStarted && !preflightDenied
      ? HARDWARE_DEPLOY_UNCONFIRMED_MESSAGE
      : error instanceof DeviceAdmissionError && error.detail
        ? `Hardware deploy refused: ${error.detail}. Rebuild the program or reflash the board. No program was sent.`
        : 'Hardware deploy preflight failed. No program was sent.';
    log({ type: 'error', message: failure, source: 'runtime' });
    const refusal = { kind: 'deploy' as const, status: 'error' as const, title: 'Deploy failed', detail: failure, details: 'output' as const };
    if (deployOperation) notices.finish(deployOperation, refusal);
    else notices.report(refusal);
  }
}
