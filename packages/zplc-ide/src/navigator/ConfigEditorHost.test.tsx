import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ZPLCProjectConfig } from '../types';
import { CONFIG_EDITOR_KINDS, type ConfigEditorKind } from './configEditors';

// The editors reach the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
}));
const { ConfigEditorBody } = await import('./ConfigEditorHost');
const { CONFIG_EDITOR_SECTIONS } = await import('./configEditorSections');
const { CommunicationSection } = await import('../components/settings/CommunicationSection');
const { IOSection } = await import('../components/settings/IOSection');
const { NetworkSection } = await import('../components/settings/NetworkSection');
const { TargetSection } = await import('../components/settings/TargetSection');
const { TasksSection } = await import('../components/settings/TasksSection');

const config = {
  name: 'Plant',
  version: '1.2.3',
  target: { board: 'rpi_pico_w', cpu: 'rp2040-77', clock_mhz: 133 },
  network: {
    hostname: 'plc-host-77',
    wifi: {
      enabled: true,
      ssid: 'ssid-77',
      password: 'secret-77',
      security: 'wpa2-psk',
      hiddenSsid: false,
      ipv4: { dhcp: false, ip: '10.7.7.7', netmask: '255.255.255.0', gateway: '10.7.7.1', dns: '10.7.7.2' },
    },
    ethernet: { enabled: false, macAddress: '02:00:00:00:00:77', ipv4: { dhcp: true } },
    ntp: { enabled: true, server: 'ntp-77.example.org' },
  },
  io: {
    inputs: [{ name: 'Start77', address: '%IX0.0', pin: 2, description: 'start button 77', type: 'BOOL' }],
    outputs: [{ name: 'Lamp77', address: '%QX0.0', pin: 25, description: 'lamp 77', type: 'BOOL' }],
    virtual: [{ name: 'Image77', address: '%IX1.0', type: 'BOOL' }],
  },
  communication: {
    mqtt: {
      enabled: true,
      profile: 'generic-broker',
      protocolVersion: '3.1.1',
      transport: 'tcp',
      broker: 'broker-77.example.org',
      port: 1883,
      clientId: 'client-77',
      keepAliveSec: 60,
      cleanSession: true,
      sessionExpirySec: 0,
      topicNamespace: 'plant77',
      publishIntervalMs: 1000,
      publishQos: 0,
      subscribeQos: 0,
      publishRetain: false,
      securityLevel: 'none',
      lwtEnabled: false,
      lwtQos: 0,
      lwtRetain: false,
    },
    modbus: {
      enabled: true,
      unitId: 77,
      tcpEnabled: true,
      tcpPort: 1502,
      rtuEnabled: false,
      rtuBaud: 19200,
      rtuParity: 'none',
      pollIntervalMs: 100,
    },
    tags: [{ name: 'Tag77', symbol: 'Motor77.Run', type: 'BOOL', mode: 'publish' }],
  },
  tasks: [{ name: 'Task77', trigger: 'cyclic', interval_ms: 77, priority: 7, programs: ['Prog77'] }],
} as unknown as ZPLCProjectConfig;

const OLD_SECTIONS = {
  tasks: TasksSection,
  io: IOSection,
  network: NetworkSection,
  communication: CommunicationSection,
  target: TargetSection,
} as const;

/**
 * Every setting of the old settings page that each editor holds, as a value of the fixture the form must show. The network
 * form follows the board (the Wi-Fi password is a masked field that does not echo its value): a Wi-Fi board shows the Wi-Fi settings and an
 * Ethernet board the Ethernet ones, both with the host name and the time server.
 */
const SETTINGS_OF: Record<ConfigEditorKind, { board?: string; values: string[] }[]> = {
  // the programs assigned to a task are offered from the programs of the project's files (the same section code, checked above)
  tasks: [{ values: ['Task77', '77', 'cyclic'] }],
  io: [{ values: ['Start77', '%IX0.0', 'start button 77', 'Lamp77', '%QX0.0', 'lamp 77', 'Image77'] }],
  network: [
    {
      board: 'esp32s3_devkitc',
      values: ['plc-host-77', 'ssid-77', 'wpa2-psk', '10.7.7.7', '255.255.255.0', '10.7.7.1', '10.7.7.2', 'ntp-77.example.org'],
    },
    { board: 'nucleo_h743zi', values: ['plc-host-77', '02:00:00:00:00:77', 'ntp-77.example.org'] },
  ],
  communication: [
    {
      values: ['broker-77.example.org', '1883', 'client-77', 'plant77', 'generic-broker', '3.1.1', '1502', '19200', 'Tag77', 'Motor77.Run'],
    },
  ],
  target: [{ values: ['rpi_pico_w', '133'] }],
};

const noop = () => undefined;

// The toolchain card of the target editor asks the desktop bridge; there is none in a test.
const host = globalThis as { window?: unknown };
beforeEach(() => {
  host.window = {};
});
afterEach(() => {
  delete host.window;
});

describe('configuration editors keep every setting of the old page (UX-013)', () => {
  it('UX-013 hosts the same section component the settings page held, for each of the five editors', () => {
    for (const kind of CONFIG_EDITOR_KINDS) expect(CONFIG_EDITOR_SECTIONS[kind]).toBe(OLD_SECTIONS[kind]);
  });

  it('UX-013 renders exactly what the old section rendered: nothing is added to the form and nothing is dropped from it', () => {
    for (const kind of CONFIG_EDITOR_KINDS) {
      const Section = OLD_SECTIONS[kind];
      expect(renderToStaticMarkup(<ConfigEditorBody kind={kind} config={config} updateConfig={noop} />)).toBe(
        renderToStaticMarkup(<Section config={config} updateConfig={noop} />),
      );
    }
  });

  it('UX-013 shows, in the editor of each kind, the value of every setting that kind holds', () => {
    for (const kind of CONFIG_EDITOR_KINDS) {
      for (const { board, values } of SETTINGS_OF[kind]) {
        const shown = board ? { ...config, target: { ...config.target!, board } } : config;
        const markup = renderToStaticMarkup(<ConfigEditorBody kind={kind} config={shown} updateConfig={noop} />);
        const missing = values.filter((value) => !markup.includes(value));
        expect({ kind, board, missing }).toEqual({ kind, board, missing: [] });
      }
    }
  });
});
