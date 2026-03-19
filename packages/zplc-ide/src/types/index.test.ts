import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { DEFAULT_ZPLC_CONFIG } from './index';
import { normalizeNetworkConfigForBoard } from '../config/boardProfiles';

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

describe('release claim consistency', () => {
  it('keeps release claims aligned with declared evidence gates', () => {
    const root = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../');
    const matrix = readFileSync(
      join(root, 'specs/008-release-foundation/artifacts/release-evidence-matrix.md'),
      'utf8'
    );
    const claims = readFileSync(
      join(root, 'specs/008-release-foundation/artifacts/release-claims.md'),
      'utf8'
    );

    const gateIds = new Set(
      matrix
        .split('\n')
        .filter((line) => line.startsWith('| REL-'))
        .map((line) => line.split('|')[1]?.trim())
        .filter((value): value is string => Boolean(value))
    );

    const claimGateIds = claims
      .split('\n')
      .filter((line) => line.startsWith('| CLAIM-'))
      .flatMap((line) =>
        line
          .split('|')[4]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      );

    expect(claimGateIds.length).toBeGreaterThan(0);
    for (const gateId of claimGateIds) {
      expect(gateIds.has(gateId)).toBe(true);
    }
  });
});

describe('protocol configuration defaults', () => {
  it('keeps mqtt disabled for non-network boards after normalization', () => {
    const normalized = normalizeNetworkConfigForBoard(DEFAULT_ZPLC_CONFIG.network, 'rpi_pico');
    expect(normalized?.wifi).toBeUndefined();
    expect(normalized?.ethernet).toBeUndefined();
  });

  it('preserves mqtt and modbus defaults for network-capable release boards', () => {
    expect(DEFAULT_ZPLC_CONFIG.communication?.mqtt?.transport).toBe('tcp');
    expect(DEFAULT_ZPLC_CONFIG.communication?.modbus?.tcpEnabled).toBe(true);
    expect(DEFAULT_ZPLC_CONFIG.communication?.modbus?.rtuEnabled).toBe(false);
  });
});
