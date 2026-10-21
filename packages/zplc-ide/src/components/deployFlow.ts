/**
 * The deploy to a real device, from the checked program to the result (COM-028): preflight against what the device
 * reports, the confirmation dialog (UX-019), the check that nothing changed while the person decided, the transfer and
 * its outcome. The toolbar, the menu, the palette and the keyboard all reach it through one handler, and the dialog is
 * the only way past the preflight: no other path starts a transfer (AGENTS.md rule 7).
 */
import { t } from '../i18n';
import type { DebugMap } from '../compiler';
import { DEVICE_ADMISSION_CODE, DeviceAdmissionError } from '../runtime/deviceHandshake';
import { useDeployedProgram } from '../store/deployedProgram';
import { useNotifications } from '../store/notifications';
import { confirmDeploy, showDeployRefusal } from './deployConfirm';
import { nextProgramLoadStateAfterDeploy, PROGRAM_LOAD_STATE, type LastCompileResult } from './debugSessionState';
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
    const input = {
      bytecode: dataToUpload,
      projectBoard: started.board,
      projectName: started.name,
      systemInfo: deps.systemInfo(),
      taskCount: result.taskCount,
    };
    let confirmation;
    try {
      confirmation = await createHardwareDeployConfirmation(input);
    } catch (refusal) {
      // Say what does not match before the refusal is reported, so the person sees the rows and not only a sentence.
      if (refusal instanceof DeviceAdmissionError) await showDeployRefusal(await gatherDeployFacts(input), refusal.detail);
      throw refusal;
    }
    if (!(await confirmDeploy(confirmation, deps.running))) {
      log({ type: 'info', message: t('deploy.log.cancelled'), source: 'runtime' });
      notices.report({
        kind: 'deploy',
        status: 'cancelled',
        title: t('notices.deploy.cancelled'),
        detail: t('notices.deploy.cancelledDetail'),
        details: 'output',
      });
      return;
    }
    const now = deps.project();
    if (deps.currentResult() !== result || now.session !== started.session || now.board !== started.board) {
      log({ type: 'warning', message: t('deploy.log.projectChanged'), source: 'runtime' });
      notices.report({
        kind: 'deploy',
        status: 'warning',
        title: t('notices.deploy.refused'),
        detail: t('notices.deploy.refusedDetail'),
        details: 'output',
      });
      return;
    }

    const description = t('notices.deploy.description', { bytes: confirmation.byteLength, tasks: confirmation.taskCount });
    log({ type: 'info', message: description, source: 'runtime' });
    programSendStarted = true;
    deployOperation = notices.begin({ kind: 'deploy', title: t('notices.deploy.running'), detail: description, details: 'output' });
    useDeployedProgram.getState().clear(); // LRN-023: the board may no longer hold the program a hash names
    await deps.loadProgram(dataToUpload, result.debugMap, started.board);
    void useDeployedProgram.getState().publish(dataToUpload);
    if (
      nextProgramLoadStateAfterDeploy(deployedRevision, deps.compileRevision(), deployedCompilerRunId, deps.compilerRunId()) ===
      PROGRAM_LOAD_STATE.LOADED
    ) {
      deps.setProgramLoadState(PROGRAM_LOAD_STATE.LOADED);
      log({ type: 'success', message: t('deploy.log.deployed'), source: 'runtime' });
      notices.finish(deployOperation, { kind: 'deploy', status: 'success', title: t('notices.deploy.done'), details: 'output' });
    } else {
      deps.setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
      log({ type: 'warning', message: t('deploy.log.earlierBuild'), source: 'runtime' });
      notices.finish(deployOperation, {
        kind: 'deploy',
        status: 'warning',
        title: t('notices.deploy.earlier'),
        detail: t('notices.deploy.earlierDetail'),
        details: 'output',
      });
    }
  } catch (error) {
    const preflightDenied = error instanceof DeviceAdmissionError && error.code !== DEVICE_ADMISSION_CODE.RESULT_UNKNOWN;
    deps.setProgramLoadState(PROGRAM_LOAD_STATE.EMPTY);
    const failure =
      programSendStarted && !preflightDenied
        ? t('deploy.unconfirmed')
        : error instanceof DeviceAdmissionError && error.detail
          ? t('deploy.refused', { detail: error.detail })
          : t('deploy.preflightFailed');
    log({ type: 'error', message: failure, source: 'runtime' });
    const refusal = {
      kind: 'deploy' as const,
      status: 'error' as const,
      title: t('notices.deploy.failed'),
      detail: failure,
      details: 'output' as const,
    };
    if (deployOperation) notices.finish(deployOperation, refusal);
    else notices.report(refusal);
  }
}
