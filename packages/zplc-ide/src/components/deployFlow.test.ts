import { afterEach, describe, expect, it } from 'bun:test';
import { ZPLC_CONSTANTS } from '@zplc/compiler';
import { answerConfirmation, currentConfirmation, mountConfirmHost } from '../store/actionConfirm';
import { useNotifications } from '../store/notifications';
import { PROGRAM_LOAD_STATE, type LastCompileResult } from './debugSessionState';
import { performHardwareDeploy, type DeployDeps } from './deployFlow';
import { t } from '../i18n';

function artifact(): Uint8Array {
  const bytes = new Uint8Array(ZPLC_CONSTANTS.HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, ZPLC_CONSTANTS.MAGIC, true);
  view.setUint16(4, ZPLC_CONSTANTS.VERSION_MAJOR, true);
  view.setUint16(6, ZPLC_CONSTANTS.VERSION_MINOR, true);
  view.setUint32(ZPLC_CONSTANTS.DRAFT_COUNTER_OFFSET, ZPLC_CONSTANTS.DRAFT_COUNTER, true);
  return bytes;
}

const systemInfo = {
  board: 'stm32f746g_disco', board_profile: 'stm32f746g_disco/stm32f746xx', zplc_version: '1.0.0', zephyr_version: '4.0.0', uptime_ms: 0, cpu_freq_mhz: 216,
  device_protocol_version: 1, bytecode_abi_major: 1, bytecode_abi_minor: 0, draft_counter: ZPLC_CONSTANTS.DRAFT_COUNTER,
  capabilities: { fpu: true, mpu: true, scheduler: true, max_tasks: 4 }, memory: { work_size: 1, retain_size: 1, ipi_size: 1, opi_size: 1 },
};

const result = { bytecode: artifact(), zplcFile: artifact(), assembly: '', fileName: 'main.zplc', codeSize: 0, hasTaskSegment: true, taskCount: 1, debugMap: {}, revision: 3, compilerRunId: 9 } as unknown as LastCompileResult;

function harness(overrides: Partial<DeployDeps> = {}) {
  const calls: string[] = [];
  const logs: string[] = [];
  const states: string[] = [];
  let session: unknown = 'session-1';
  const deps: DeployDeps = {
    result,
    running: false,
    project: () => ({ session, board: 'stm32f746g_disco', name: 'Pump station' }),
    currentResult: () => result,
    compilerRunId: () => 9,
    compileRevision: () => 3,
    systemInfo: () => systemInfo,
    loadProgram: async () => { calls.push('load'); },
    setProgramLoadState: (state) => { states.push(state); },
    log: (entry) => { logs.push(`${entry.type}: ${entry.message}`); },
    ...overrides,
  };
  return { deps, calls, logs, states, changeSession: () => { session = 'session-2'; } };
}

/** Waits for the dialog to open, lets the test look at it, and answers. */
async function answerWhenAsked(answer: boolean, inspect?: (request: NonNullable<ReturnType<typeof currentConfirmation>>) => void) {
  for (let turns = 0; turns < 200 && currentConfirmation() === null; turns += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  const request = currentConfirmation();
  if (!request) throw new Error('the deploy dialog never opened');
  inspect?.(request);
  answerConfirmation(answer);
}

let unmount: (() => void) | null = null;
// The notification store is shared by every test file of the run, so what these tests report must not stay in it.
afterEach(() => { unmount?.(); unmount = null; useNotifications.setState(useNotifications.getInitialState(), true); });
const open = () => { unmount = mountConfirmHost(); };

describe('COM-028 and UX-019 the deploy goes through the dialog and nowhere else', () => {
  it('UX-019 sends nothing when the person cancels, and says so', async () => {
    open();
    const { deps, calls, logs } = harness();
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(false, (request) => expect(request).toMatchObject({ title: 'Deploy to the device?', actionLabel: 'Deploy', cancelLabel: 'Cancel' }));
    await flow;
    expect(calls).toEqual([]);
    expect(logs).toEqual(['info: Hardware deploy cancelled; no program was sent.']);
    expect(useNotifications.getState().items.some((item) => item.title === 'Deploy cancelled')).toBe(true);
  });

  it('COM-028 writes the confirmed program only after the person chose the action, and leaves it deployed and stopped', async () => {
    open();
    const calls: string[] = [];
    const { deps, logs, states } = harness({ loadProgram: async (data) => { calls.push(`load:${data.byteLength}:${currentConfirmation() === null ? 'after-dialog' : 'during-dialog'}`); } });
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(true);
    await flow;
    expect(calls).toEqual([`load:${ZPLC_CONSTANTS.HEADER_SIZE}:after-dialog`]);
    expect(states).toEqual([PROGRAM_LOAD_STATE.LOADED]);
    expect(logs.at(-1)).toBe('success: Program deployed and stopped.');
  });

  it('UX-019 names the action "Stop PLC and deploy" when the PLC is running', async () => {
    open();
    const { deps, calls } = harness({ running: true });
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(false, (request) => expect(request).toMatchObject({ actionLabel: 'Stop PLC and deploy', destructive: true }));
    await flow;
    expect(calls).toEqual([]);
  });

  it('COM-028 refuses to write when the project changed while the dialog was open', async () => {
    open();
    const { deps, calls, logs, changeSession } = harness();
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(true, () => changeSession());
    await flow;
    expect(calls).toEqual([]);
    expect(logs).toEqual(['warning: Project changed before deploy confirmation. Build the current source before deploying.']);
  });

  it('UX-019 shows the rows that do not match when the device refuses the program, and writes nothing', async () => {
    open();
    const { deps, calls, logs, states } = harness({ systemInfo: () => ({ ...systemInfo, board_profile: 'rpi_pico/rp2040' }) });
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(true, (request) => {
      expect(request).toMatchObject({ title: 'Deploy blocked', actionLabel: null, cancelLabel: 'Close' });
    });
    await flow;
    expect(calls).toEqual([]);
    expect(states).toEqual([PROGRAM_LOAD_STATE.EMPTY]);
    expect(logs).toEqual(['error: Hardware deploy preflight failed. No program was sent.']);
  });

  it('COM-028 reports an unconfirmed device state when the transfer fails after it started', async () => {
    open();
    const { deps, logs } = harness({ loadProgram: async () => { throw new Error('link lost'); } });
    const flow = performHardwareDeploy(deps);
    await answerWhenAsked(true);
    await flow;
    expect(logs.at(-1)).toBe(`error: ${t('deploy.unconfirmed')}`);
  });

  it('UX-019 never writes when no dialog can be shown, because nobody was asked', async () => {
    const { deps, calls, logs } = harness();
    await performHardwareDeploy(deps);
    expect(calls).toEqual([]);
    expect(logs).toEqual(['info: Hardware deploy cancelled; no program was sent.']);
  });
});
