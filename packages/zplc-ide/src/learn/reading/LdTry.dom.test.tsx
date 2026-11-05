import { describe, expect, it } from 'bun:test';
import { setupDom } from '../../test/dom';
import type { LdTryData } from '../readingTypes';
import { OFF_DELAY, OFF_DELAY_SRC } from './fixtures/blocks';
import { LdTry } from './LdTry';
import { openTryLab, type TryLab } from '../../runtime/tryLab';

const dom = await setupDom();

/** A lab that records what the page asks of it and answers the readings from `values`, by variable name. */
function fakeLab(values: Record<string, boolean> = {}, powered: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const lab: TryLab = {
    run: async () => void calls.push('run'),
    hold: async () => void calls.push('hold'),
    restart: async () => void calls.push('restart'),
    press: async (name, on) => void calls.push(`press ${name} ${on}`),
    readings: async () => {
      calls.push('read');
      const states = new Map(Object.entries(powered).map(([id, power]) => [id, { power, pins: {}, pinFlags: {} }]));
      return { read: (variable) => values[variable], states };
    },
    close: async () => void calls.push('close'),
  };
  const open: typeof openTryLab = () => ({ ok: true, lab });
  return { open, calls, values, powered };
}

const DATA: LdTryData = { src: OFF_DELAY_SRC, inputs: [{ name: 'Button', kind: 'push' }], outputs: ['Light'], timing: ['Button', 'Light'] };
const files = { [OFF_DELAY_SRC]: OFF_DELAY };

function lab(fake: ReturnType<typeof fakeLab>, data: LdTryData = DATA) {
  return dom.render(<LdTry data={data} files={files} open={fake.open} />);
}
const statusOf = () => dom.screen.getByRole('status').getAttribute('data-lab-status');
const run = async (user: ReturnType<typeof lab>['user']) => {
  await user.click(dom.screen.getByRole('button', { name: 'Run' }));
  await dom.waitFor(() => expect(statusOf()).toBe('running'));
};
const presses = (calls: string[]) => calls.filter((call) => call.startsWith('press '));

describe('try-it lab (LRN-041)', () => {
  it('does nothing on its own: the lab waits for Run, and Run, Pause and Reset drive it', async () => {
    const fake = fakeLab();
    const { user } = lab(fake);
    await Bun.sleep(250);
    expect(statusOf()).toBe('idle');
    expect(fake.calls).toEqual([]);
    expect((dom.screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(true);
    await run(user);
    expect(fake.calls[0]).toBe('run');
    await user.click(dom.screen.getByRole('button', { name: 'Pause' }));
    await dom.waitFor(() => expect(statusOf()).toBe('paused'));
    await user.click(dom.screen.getByRole('button', { name: 'Run' }));
    await dom.waitFor(() => expect(statusOf()).toBe('running'));
    await user.click(dom.screen.getByRole('button', { name: 'Reset' }));
    await dom.waitFor(() => expect(statusOf()).toBe('idle'));
    expect(fake.calls.filter((call) => call !== 'read')).toEqual(['run', 'hold', 'run', 'restart']);
  });

  it('holds a push input while a pointer is down and lets go on release', async () => {
    const fake = fakeLab();
    const { user } = lab(fake);
    await run(user);
    const button = dom.screen.getByRole('button', { name: 'Button (hold to press)' });
    dom.fireEvent.pointerDown(button);
    await dom.waitFor(() => expect(presses(fake.calls)).toEqual(['press Button true']));
    expect(button.getAttribute('data-pressed')).toBe('true');
    dom.fireEvent.pointerUp(button);
    await dom.waitFor(() => expect(presses(fake.calls)).toEqual(['press Button true', 'press Button false']));
    expect(button.getAttribute('data-pressed')).toBe('false');
  });

  it('is held by Space or Enter on the keyboard and released on key up, once however many keys repeat', async () => {
    const fake = fakeLab();
    const { user } = lab(fake);
    await run(user);
    const button = dom.screen.getByRole('button', { name: 'Button (hold to press)' });
    button.focus();
    await user.keyboard('{ >}');
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(1));
    dom.fireEvent.keyDown(button, { key: ' ', repeat: true });
    dom.fireEvent.keyDown(button, { key: ' ', repeat: true });
    await user.keyboard('{/ }');
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(2));
    await user.keyboard('{Enter>}');
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(3));
    await user.keyboard('{/Enter}');
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(4));
    expect(presses(fake.calls).map((call) => call.split(' ')[2])).toEqual(['true', 'false', 'true', 'false']);
  });

  it('lets go of a held input when the focus leaves the control', async () => {
    const fake = fakeLab();
    const { user } = lab(fake);
    await run(user);
    const button = dom.screen.getByRole('button', { name: 'Button (hold to press)' });
    dom.fireEvent.pointerDown(button);
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(1));
    dom.fireEvent.blur(button);
    await dom.waitFor(() => expect(presses(fake.calls)).toHaveLength(2));
  });

  it('toggles a switch input with aria-pressed', async () => {
    const fake = fakeLab();
    const { user } = lab(fake, { ...DATA, inputs: [{ name: 'Button', kind: 'switch' }] });
    await run(user);
    const toggle = dom.screen.getByRole('button', { name: 'Button: off' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await user.click(toggle);
    expect(dom.screen.getByRole('button', { name: 'Button: on' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(dom.screen.getByRole('button', { name: 'Button: on' }));
    await dom.waitFor(() => expect(presses(fake.calls)).toEqual(['press Button true', 'press Button false']));
  });

  it('shows each output as a lamp that says its state in words, and not read as such', async () => {
    const fake = fakeLab();
    const { user } = lab(fake);
    const lamp = () => dom.screen.getByText(/^Light:/);
    expect(lamp().textContent).toContain('Light: not read');
    await run(user);
    fake.values.Light = false;
    await dom.waitFor(() => expect(lamp().textContent).toContain('Light: off'));
    fake.values.Light = true;
    await dom.waitFor(() => expect(lamp().textContent).toContain('Light: on'));
    expect(lamp().closest('li')?.getAttribute('data-state')).toBe('on');
  });

  it('draws the power flow of the rung from what the session reads', async () => {
    const fake = fakeLab({}, { 'rung:rung_1/cell:0,6': false });
    const { container, user } = lab(fake);
    await run(user);
    const powered = () => container.querySelector('[data-ld-cell="0,6"]')?.getAttribute('data-powered');
    await dom.waitFor(() => expect(powered()).toBe('false'));
    fake.powered['rung:rung_1/cell:0,6'] = true;
    await dom.waitFor(() => expect(powered()).toBe('true'));
  });

  it('draws the timing chart of its signals from the run, and only while it runs', async () => {
    const fake = fakeLab({ Button: false, Light: false });
    const { container, user } = lab(fake);
    await run(user);
    fake.values.Button = true;
    await dom.waitFor(() => expect(container.querySelectorAll('[data-reading-block="timing"] tbody tr').length).toBeGreaterThan(2));
    const rows = [...container.querySelectorAll('[data-reading-block="timing"] tbody tr')].map(
      (row) => (row as HTMLTableRowElement).cells[0]!.textContent,
    );
    expect(rows.filter((name) => name === 'Button').length).toBeGreaterThanOrEqual(2);
  });

  it('closes its lab on unmount and clears its poll timer', async () => {
    const fake = fakeLab();
    const { user, unmount } = lab(fake);
    await run(user);
    await dom.waitFor(() => expect(fake.calls).toContain('read'));
    unmount();
    await dom.waitFor(() => expect(fake.calls.at(-1)).toBe('close'));
    const reads = fake.calls.filter((call) => call === 'read').length;
    await Bun.sleep(350);
    expect(fake.calls.filter((call) => call === 'read').length).toBe(reads);
  });

  it('shows a build error inline, with no controls', () => {
    dom.render(<LdTry data={DATA} files={{ [OFF_DELAY_SRC]: '{ not json' }} />);
    const alert = dom.screen.getByRole('alert');
    expect(alert.getAttribute('data-lab-failure')).toBe('compile');
    expect(alert.textContent).toContain('could not be built');
    expect(dom.screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('says which input or output the program does not have, and when its file is missing', () => {
    const wrong = dom.render(<LdTry data={{ ...DATA, inputs: [{ name: 'Nope', kind: 'push' }] }} files={files} />);
    expect(dom.within(wrong.container).getByRole('alert').textContent).toContain('the input Nope');
    wrong.unmount();
    const out = dom.render(<LdTry data={{ ...DATA, outputs: ['Nope'] }} files={files} />);
    expect(dom.within(out.container).getByRole('alert').textContent).toContain('the output Nope');
    out.unmount();
    const gone = dom.render(<LdTry data={DATA} files={{}} />);
    expect(dom.within(gone.container).getByRole('alert').textContent).toContain(OFF_DELAY_SRC);
  });

  it('shows a failure of the session as an inline message and stops polling', async () => {
    const fake = fakeLab();
    const { open } = fake;
    const failing: typeof openTryLab = (...args) => {
      const opened = open(...args);
      if (opened.ok) opened.lab.readings = async () => Promise.reject(new Error('the runtime went away'));
      return opened;
    };
    const { user } = dom.render(<LdTry data={DATA} files={files} open={failing} />);
    await user.click(dom.screen.getByRole('button', { name: 'Run' }));
    expect((await dom.screen.findByRole('alert')).textContent).toContain('the runtime went away');
  });

  it('shows the browser runtime missing as an inline message when Run is pressed on the real lab', async () => {
    const { user } = dom.render(<LdTry data={DATA} files={files} />);
    await user.click(dom.screen.getByRole('button', { name: 'Run' }));
    const alert = await dom.screen.findByRole('alert');
    expect(alert.getAttribute('data-lab-failure')).toBe('runtime');
  });
});
