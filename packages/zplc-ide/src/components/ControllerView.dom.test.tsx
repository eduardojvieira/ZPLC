import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { connectionManager } = await import('../runtime/connectionManager');
const { ControllerView } = await import('./ControllerView');

type Emitter = {
  notifyConnectionChange(connected: boolean): void;
  notifySystemInfo(info: unknown): void;
  notifyStatus(status: unknown): void;
};
const emit = connectionManager as unknown as Emitter;

const INFO = { board: 'Test board', zplc_version: '1.2.3', zephyr_version: '4.0.0', cpu_freq_mhz: 120, uptime_ms: 61000, capabilities: { fpu: true, mt: false, mpu: false }, memory: { work_size: 4096, retain_size: 1024, code_size_max: 8192, ipi_size: 64, opi_size: 64, work_base: 0, retain_base: 4096 } };
const STATUS = { state: 'RUNNING', uptime_ms: 61000, stats: { cycles: 1234, overruns: 0, active_tasks: 1 }, tasks: [{ slot: 0, id: 1, prio: 5, interval_us: 10000, cycles: 99, state: 'READY' }] };

describe('Controller view (UX-011, UX-018) in a DOM', () => {
  it('says that no device is connected and where to connect one', () => {
    dom.render(<ControllerView />);
    expect(dom.screen.getByText(dom.t('controller.noDeviceConnected'))).toBeTruthy();
    expect(dom.screen.getByText(dom.t('controller.useToolbarConnect'))).toBeTruthy();
  });

  it('shows a waiting message after the connection and the device once it reports', async () => {
    dom.render(<ControllerView />);
    await dom.act(async () => { emit.notifyConnectionChange(true); });
    expect(dom.screen.getByText(dom.t('controller.fetchingDeviceInfo'))).toBeTruthy();
    await dom.act(async () => { emit.notifySystemInfo(INFO); emit.notifyStatus(STATUS); });
    expect(dom.screen.getByText('Test board')).toBeTruthy();
    await dom.act(async () => { emit.notifyConnectionChange(false); });
    expect(dom.screen.getByText(dom.t('controller.noDeviceConnected'))).toBeTruthy();
  });

  it('a section header is a button whose expanded state follows its click and Enter', async () => {
    const { user } = dom.render(<ControllerView />);
    await dom.act(async () => { emit.notifyConnectionChange(true); emit.notifySystemInfo(INFO); emit.notifyStatus(STATUS); });
    const info = dom.screen.getByRole('button', { name: dom.t('controller.deviceInfo') });
    expect(info.getAttribute('aria-expanded')).toBe('true');
    await user.click(info);
    expect(info.getAttribute('aria-expanded')).toBe('false');
    info.focus();
    await user.keyboard('{Enter}');
    expect(info.getAttribute('aria-expanded')).toBe('true');
    await dom.act(async () => { emit.notifyConnectionChange(false); });
  });

  it('lists the tasks of the device in a table with named columns', async () => {
    dom.render(<ControllerView />);
    await dom.act(async () => { emit.notifyConnectionChange(true); emit.notifySystemInfo(INFO); emit.notifyStatus(STATUS); });
    expect(dom.screen.getByRole('columnheader', { name: dom.t('controller.id') })).toBeTruthy();
    expect(dom.screen.getByRole('columnheader', { name: dom.t('controller.interval') })).toBeTruthy();
    await dom.act(async () => { emit.notifyConnectionChange(false); });
  });
});
