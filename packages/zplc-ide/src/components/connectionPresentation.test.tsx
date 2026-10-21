import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { translatorFor } from '../i18n';
import { presentConnection, type ConnectionIndicatorInput } from './connectionPresentation';
import { ConnectionIndicator } from './ConnectionIndicator';
import { presentOperationalStatus } from './operationalStatusPresentation';
import { projectLoaderStub } from '../test/projectLoaderStub';

// The status bar reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => projectLoaderStub());
const { OperationalStatusView } = await import('./OperationalStatusBar');

const { t } = translatorFor('en');
const idle: ConnectionIndicatorInput = { mode: 'simulate', adapterType: null, connected: false, connecting: false, faulted: false };
const present = (input: Partial<ConnectionIndicatorInput>) => presentConnection({ ...idle, ...input }, t);

describe('UX-018 connection indicator presentation', () => {
  it('UX-018 says in words that nothing is connected', () => {
    expect(present({})).toMatchObject({ state: 'disconnected', label: 'Not connected', tone: 'neutral', icon: 'unplug' });
    expect(present({ mode: 'hardware' })).toMatchObject({ state: 'disconnected' });
  });

  it('UX-018 names the native and the browser simulation, whatever the selected mode says', () => {
    expect(present({ adapterType: 'native', connected: true })).toMatchObject({
      state: 'simulation-native',
      label: 'Simulation · native runtime',
      tone: 'info',
      icon: 'monitor',
    });
    expect(present({ adapterType: 'wasm', connected: true })).toMatchObject({
      state: 'simulation-wasm',
      label: 'Simulation · browser runtime',
      tone: 'info',
      icon: 'globe',
    });
  });

  it('UX-018 shows that Studio is reaching for a real device while it connects', () => {
    expect(present({ mode: 'hardware', connecting: true })).toMatchObject({
      state: 'hardware-connecting',
      label: 'Connecting to hardware',
      icon: 'loader',
    });
  });

  it('UX-018 says real hardware with the board and the link when they are known', () => {
    expect(present({ mode: 'hardware', adapterType: 'serial', connected: true })).toMatchObject({
      state: 'hardware-connected',
      label: 'Real hardware',
      tone: 'warning',
      icon: 'cpu',
    });
    expect(present({ mode: 'hardware', adapterType: 'serial', connected: true, board: 'rpi_pico', link: 'framed' }).label).toBe(
      'Real hardware · rpi_pico · framed link',
    );
    expect(present({ mode: 'hardware', adapterType: 'serial', connected: true, link: 'shell' }).label).toBe(
      'Real hardware · text shell link',
    );
  });

  it('UX-018 shows a fault of the hardware as a fault, in red with its own icon', () => {
    expect(present({ mode: 'hardware', adapterType: 'serial', connected: true, faulted: true, board: 'rpi_pico' })).toMatchObject({
      state: 'hardware-faulted',
      label: 'Hardware fault · rpi_pico',
      tone: 'danger',
      icon: 'alert',
    });
  });

  it('UX-018 never lets simulation and real hardware share text, icon or tone', () => {
    const simulations = [present({ adapterType: 'native', connected: true }), present({ adapterType: 'wasm', connected: true })];
    const hardware = [
      present({ adapterType: 'serial', connected: true, mode: 'hardware' }),
      present({ adapterType: 'serial', connected: true, faulted: true, mode: 'hardware' }),
    ];
    for (const sim of simulations) {
      for (const real of hardware) {
        expect(sim.label).not.toBe(real.label);
        expect(sim.icon).not.toBe(real.icon);
        expect(sim.tone).not.toBe(real.tone);
      }
    }
    expect(simulations.every((sim) => /^Simulation/.test(sim.label))).toBe(true);
    expect(hardware.every((real) => /hardware/i.test(real.label))).toBe(true);
  });

  it('UX-018 speaks Spanish when the interface does', () => {
    const es = translatorFor('es').t;
    expect(presentConnection({ ...idle, adapterType: 'serial', connected: true, mode: 'hardware', board: 'rpi_pico' }, es).label).toBe(
      'Hardware real · rpi_pico',
    );
  });
});

describe('UX-018 connection indicator rendering', () => {
  it('UX-018 renders the text, an icon that is hidden from readers, and the tone as data, so colour is never the only cue', () => {
    const out = renderToStaticMarkup(
      <ConnectionIndicator indicator={present({ mode: 'hardware', adapterType: 'serial', connected: true, board: 'rpi_pico' })} />,
    );
    expect(out).toContain('Real hardware · rpi_pico');
    expect(out).toContain('data-connection="hardware-connected"');
    expect(out).toContain('data-tone="warning"');
    expect(out).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(out).toContain('role="status"');
  });
});

describe('UX-018 force banner stays in the status bar', () => {
  const status = { text: 'Running', tone: 'success' as const };
  const view = (forcedValuesCount: number, forcesUnconfirmed: boolean) =>
    renderToStaticMarkup(
      <OperationalStatusView
        indicator={present({ adapterType: 'native', connected: true })}
        presentation={presentOperationalStatus({
          mode: 'simulate',
          adapterType: 'native',
          connected: true,
          vmInfo: { cycles: 4 },
          status,
          projectTargetBoard: 'rpi_pico',
          projectTasks: [],
          controllerInfo: null,
          controllerStatus: null,
          forcedValuesCount,
          forcesUnconfirmed,
          nativeTrace: [],
        })}
      />,
    );

  it('UX-018 shows the connection indicator first in the operational status region', () => {
    const out = view(0, false);
    expect(out).toContain('aria-label="Operational status"');
    expect(out.indexOf('Simulation · native runtime')).toBeGreaterThan(0);
    expect(out.indexOf('Simulation · native runtime')).toBeLessThan(out.indexOf('Native POSIX'));
  });

  it('UX-018 keeps the amber banner for active forces', () => {
    const out = view(2, false);
    expect(out).toContain('2 active forces');
    expect(out).toContain('border-[var(--signal-forced-border)]');
    expect(out).not.toContain('role="alert"');
  });

  it('UX-018 keeps the alert for an unconfirmed force', () => {
    const out = view(1, true);
    expect(out).toContain('Force state unconfirmed');
    expect(out).toContain('role="alert"');
  });
});
