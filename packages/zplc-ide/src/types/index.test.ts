import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { DEFAULT_ZPLC_CONFIG, createEmptyFileContent, getLanguageFromFilename } from './index';
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
    const matrix = readFileSync(join(root, 'specs/008-release-foundation/artifacts/release-evidence-matrix.md'), 'utf8');
    const claims = readFileSync(join(root, 'specs/008-release-foundation/artifacts/release-claims.md'), 'utf8');

    const gateIds = new Set(
      matrix
        .split('\n')
        .filter((line) => line.startsWith('| REL-'))
        .map((line) => line.split('|')[1]?.trim())
        .filter((value): value is string => Boolean(value)),
    );

    const claimGateIds = claims
      .split('\n')
      .filter((line) => line.startsWith('| CLAIM-'))
      .flatMap((line) =>
        line
          .split('|')[4]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
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

  it('names no broker and starts with MQTT off, over TLS with the certificate verified (COM-014)', () => {
    const mqtt = DEFAULT_ZPLC_CONFIG.communication?.mqtt;
    expect(mqtt?.broker).toBe('');
    expect(mqtt?.enabled).toBe(false);
    expect(mqtt?.transport).toBe('tls');
    expect(mqtt?.port).toBe(8883);
    expect(mqtt?.securityLevel).toBe('tls-server-verify');
  });

  it('preserves mqtt and modbus defaults for network-capable release boards', () => {
    expect(DEFAULT_ZPLC_CONFIG.communication?.mqtt?.transport).toBe('tls');
    expect(DEFAULT_ZPLC_CONFIG.communication?.modbus?.tcpEnabled).toBe(true);
    expect(DEFAULT_ZPLC_CONFIG.communication?.modbus?.rtuEnabled).toBe(false);
  });
});

describe('filename language detection', () => {
  it('normalizes extensions before selecting a language', () => {
    expect(getLanguageFromFilename('Counter.IL')).toBe('IL');
    expect(getLanguageFromFilename('Main.LD.JSON')).toBe('LD');
  });
});

describe('new-file templates', () => {
  // The repository ships no ld/fbd/sfc JSON schema files, so a "$schema": "./schemas/ld.schema.json" key in a new file points at nothing.
  it('create visual files without a dangling $schema', () => {
    for (const language of ['LD', 'FBD', 'SFC'] as const) {
      expect(JSON.parse(createEmptyFileContent(language)), language).not.toHaveProperty('$schema');
    }
  });
});
