import { describe, expect, it } from 'bun:test';

import type { ZPLCProjectConfig } from '../types';
import { buildProvisioningCommands, quoteZephyrShellArg } from './provisioningCommands';

function decodeZephyrShellArgument(encoded: string): string {
  return encoded.slice(1, -1).replace(/\\x([0-9a-f]{2})|\\(["\\])/gi, (_match, hex: string | undefined, escaped: string | undefined) => (
    hex ? String.fromCharCode(Number.parseInt(hex, 16)) : escaped
  ));
}

const BASE_CONFIG: ZPLCProjectConfig = {
  name: 'Test',
  version: '1.0.0',
  tasks: [{ name: 'MainTask', trigger: 'cyclic', interval_ms: 10, priority: 1, programs: ['main.st'] }],
};

describe('buildProvisioningCommands', () => {
  it('explicitly disables mqtt and modbus when project marks them disabled', () => {
    const commands = buildProvisioningCommands({
      ...BASE_CONFIG,
      communication: {
        mqtt: {
          enabled: false,
          profile: 'sparkplug-b',
          protocolVersion: '5.0',
          transport: 'tcp',
          broker: 'test.mosquitto.org',
          port: 1883,
          clientId: 'zplc-device',
          keepAliveSec: 60,
          cleanSession: true,
          sessionExpirySec: 0,
          topicNamespace: 'spBv1.0/ZPLC',
          publishIntervalMs: 2000,
          publishQos: 0,
          subscribeQos: 0,
          publishRetain: false,
          securityLevel: 'none',
          websocketPath: '/mqtt',
          lwtEnabled: false,
          lwtPayload: 'offline',
          lwtQos: 0,
          lwtRetain: false,
          azureTwinEnabled: false,
          azureDirectMethodsEnabled: false,
          azureC2dEnabled: false,
          azureDpsEnabled: false,
          azureDpsEndpoint: 'global.azure-devices-provisioning.net',
          awsShadowEnabled: false,
          awsJobsEnabled: false,
          awsFleetEnabled: false,
        },
        modbus: {
          enabled: false,
          unitId: 1,
          tcpEnabled: true,
          tcpPort: 502,
          rtuEnabled: false,
          rtuBaud: 19200,
          rtuParity: 'none',
          pollIntervalMs: 100,
          client: {
            rtuClientEnabled: false,
            rtuClientSlaveId: 1,
            rtuClientPollMs: 100,
            tcpClientEnabled: false,
            tcpClientHost: '192.168.1.100',
            tcpClientPort: 502,
            tcpClientUnitId: 1,
            tcpClientPollMs: 100,
            tcpClientTimeoutMs: 500,
          },
        },
      },
    });

    expect(commands).toContain('zplc config set mqtt_enabled 0');
    expect(commands).toContain('zplc config set modbus_tcp_enabled 0');
    expect(commands).toContain('zplc config set modbus_rtu_enabled 0');
    expect(commands).toContain('zplc config set modbus_rtu_client_enabled 0');
    expect(commands).toContain('zplc config set modbus_tcp_client_enabled 0');
    expect(commands[commands.length - 1]).toBe('zplc config save');
  });

  it('disables stale services even when communication section is absent', () => {
    const commands = buildProvisioningCommands(BASE_CONFIG);

    expect(commands).toContain('zplc config set mqtt_enabled 0');
    expect(commands).toContain('zplc config set modbus_tcp_enabled 0');
    expect(commands).toContain('zplc config set modbus_rtu_enabled 0');
  });

  it.each(['\n', '\r', '\u0000', '\u0001', '\u007f'])('rejects control characters before producing commands', (control) => {
    const injectedValue = `controller${control}zplc stop`;
    expect(() => buildProvisioningCommands({ ...BASE_CONFIG, network: { hostname: injectedValue } })).toThrow(
      'Project configuration contains unsupported control characters',
    );
  });

  it('rejects non-finite numeric config values before producing commands', () => {
    expect(() => buildProvisioningCommands({
      ...BASE_CONFIG,
      target: { board: 'test', clock_mhz: Number.NaN },
    })).toThrow('Project configuration contains unsupported numeric values');
  });
});

describe('quoteZephyrShellArg', () => {
  it.each([
    [String.raw`\x1b`, '"\\x5cx1b"'],
    [String.raw`\x0a`, '"\\x5cx0a"'],
    [String.raw`\012`, '"\\x5c012"'],
    [String.raw`\"`, '"\\x5c\\""'],
    [String.raw`C:\plant\cert.pem`, '"C:\\x5cplant\\x5ccert.pem"'],
  ])('preserves literal backslashes without creating a Zephyr escape: %s', (value, expected) => {
    const encoded = quoteZephyrShellArg(value);
    expect(encoded).toBe(expected);
    expect(decodeZephyrShellArgument(encoded)).toBe(value);
  });
});
