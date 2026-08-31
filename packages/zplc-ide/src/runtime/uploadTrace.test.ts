import { describe, expect, it } from 'bun:test';

import { formatChunkTrace, sanitizeUploadTraceCommand, sanitizeUploadTraceText } from './uploadTrace';

describe('sanitizeUploadTraceCommand', () => {
  it('masks sensitive quoted config values', () => {
    expect(sanitizeUploadTraceCommand('zplc config set wifi_pass "super-secret"')).toBe(
      'zplc config set wifi_pass "***"',
    );
  });

  it('masks sensitive unquoted config values', () => {
    expect(sanitizeUploadTraceCommand('zplc config set azure_sas_key token123')).toBe(
      'zplc config set azure_sas_key ***',
    );
  });

  it.each([
    'mqtt_password',
    'mqtt_client_key_path',
    'aws_claim_key_path',
  ])('masks provisioning credential %s', (key) => {
    expect(sanitizeUploadTraceCommand(`zplc config set ${key} "test-secret"`)).toBe(
      `zplc config set ${key} "***"`,
    );
  });

  it('leaves non-sensitive commands untouched', () => {
    expect(sanitizeUploadTraceCommand('zplc config set dhcp 1')).toBe('zplc config set dhcp 1');
  });

  it('redacts echoed sensitive commands inside prompts and multiline text', () => {
    const text = 'zplc:~$ zplc config set wifi_pass "test-secret"\nOK: saved\nzplc:~$ zplc config set mqtt_password test-token\n';

    expect(sanitizeUploadTraceText(text)).toBe(
      'zplc:~$ zplc config set wifi_pass "***"\nOK: saved\nzplc:~$ zplc config set mqtt_password ***\n',
    );
  });

  it('redacts quoted values containing escaped quotes and backslashes', () => {
    expect(sanitizeUploadTraceText('zplc config set mqtt_client_key_path "test\\\\path\\"key"')).toBe(
      'zplc config set mqtt_client_key_path "***"',
    );
  });

  it('redacts certificate chunk payloads in echoed text', () => {
    expect(sanitizeUploadTraceText('zplc:~$ zplc cert chunk 544553542d4b4559\n')).toBe(
      'zplc:~$ zplc cert chunk <payload redacted>\n',
    );
  });
});

describe('formatChunkTrace', () => {
  it('summarizes data chunks without dumping raw hex', () => {
    expect(formatChunkTrace('zplc sched data', 2, 9, 16)).toBe('zplc sched data <16 bytes hex> (2/9)');
  });
});
