import { describe, expect, test } from 'bun:test';
import { SENSITIVE_PROJECT_CONFIG_PATHS } from '../project/sensitiveConfig';
import { AI_SENSITIVE_MANIFEST_PATHS, manifestForAssistant, manifestSensitivePaths } from './manifestPrivacy';

describe('the manifest an assistant reads or proposes (IDE-030)', () => {
  test('its list of sensitive fields is the project rule, not a copy that can drift', () => {
    expect([...AI_SENSITIVE_MANIFEST_PATHS]).toEqual([...SENSITIVE_PROJECT_CONFIG_PATHS]);
  });

  test('the version the assistant reads has no sensitive field, with or without a value, and keeps the rest', () => {
    const manifest = {
      name: 'Plant',
      network: { wifi: { ssid: 'lab', password: 'hunter2' } },
      communication: {
        mqtt: { broker: 'b.example', password: '', azureSasKey: 'k', clientKeyPath: '/k', awsClaimKeyPath: '/c', apiToken: 'x' },
      },
      tasks: [{ name: 'Main', programs: ['Main.st'] }],
    };
    const shown = manifestForAssistant(manifest) as typeof manifest;
    expect(JSON.stringify(shown)).not.toMatch(/hunter2|azureSasKey|clientKeyPath|awsClaimKeyPath|apiToken|"password"/);
    expect(shown.network.wifi).toEqual({ ssid: 'lab' } as never);
    expect(shown.communication.mqtt).toEqual({ broker: 'b.example' } as never);
    expect(shown.tasks).toEqual(manifest.tasks);
    expect(manifest.network.wifi.password).toBe('hunter2');
  });

  test('a proposal that adds or changes a sensitive field is found, an empty one is not', () => {
    expect(manifestSensitivePaths({ network: { wifi: { password: 'x' } } })).toEqual(['network.wifi.password']);
    expect(manifestSensitivePaths({ communication: { mqtt: { clientKeyPath: '/k' } } })).toEqual(['communication.mqtt.clientKeyPath']);
    expect(manifestSensitivePaths({ custom: { apiToken: 'x' } })).toEqual(['custom.apiToken']);
    expect(manifestSensitivePaths({ network: { wifi: { password: '  ' } }, name: 'x' })).toEqual([]);
    expect(manifestSensitivePaths({ name: 'x', tasks: [] })).toEqual([]);
  });
});
