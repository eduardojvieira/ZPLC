import { describe, expect, it } from 'bun:test';

import { DEFAULT_ZPLC_CONFIG } from './index';

describe('DEFAULT_ZPLC_CONFIG connectivity v1.5.2', () => {
  it('includes new Modbus client defaults', () => {
    expect(DEFAULT_ZPLC_CONFIG.communication?.modbus?.client).toEqual({
      rtuClientEnabled: false,
      rtuClientSlaveId: 1,
      rtuClientPollMs: 100,
      tcpClientEnabled: false,
      tcpClientHost: '192.168.1.100',
      tcpClientPort: 502,
      tcpClientUnitId: 1,
      tcpClientPollMs: 100,
      tcpClientTimeoutMs: 500,
    });
  });

  it('includes Azure and AWS defaults', () => {
    expect(DEFAULT_ZPLC_CONFIG.communication?.mqtt?.azureC2dEnabled).toBe(false);
    expect(DEFAULT_ZPLC_CONFIG.communication?.mqtt?.azureDpsEndpoint).toBe('global.azure-devices-provisioning.net');
    expect(DEFAULT_ZPLC_CONFIG.communication?.mqtt?.awsFleetEnabled).toBe(false);
  });
});
