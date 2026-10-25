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

  test('a key that holds a credential word anywhere, in any case, is a credential; an innocent key stays', () => {
    for (const key of [
      'password2',
      'wifiPass',
      'WIFI_PASS',
      'userPwd',
      'db-passwd',
      'mySecretValue',
      'authToken2',
      'credentialsFile',
      'api_key',
      'apiKeyId',
      'private_key_pem',
      'sas_key',
      'clientKeyPath',
      'bypass',
      'compass',
    ]) {
      const manifest = { custom: { [key]: 'x' } };
      expect(manifestSensitivePaths(manifest), key).toEqual([`custom.${key}`]);
      expect(manifestForAssistant(manifest), key).toEqual({ custom: {} });
    }
    // bypass and compass end in "pass" and is taken for a credential on purpose: the rule is a suffix on pass, and a false positive only
    // hides a field
    for (const key of ['keyboardLayout', 'passive', 'compassion', 'clientId', 'passes', 'interval_ms']) {
      const manifest = { custom: { [key]: 'x' } };
      expect(manifestSensitivePaths(manifest), key).toEqual([]);
      expect(manifestForAssistant(manifest), key).toEqual(manifest);
    }
  });
});
