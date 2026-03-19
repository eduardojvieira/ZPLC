import { describe, expect, it } from 'bun:test';

import { formatChunkTrace, sanitizeUploadTraceCommand } from './uploadTrace';

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

  it('leaves non-sensitive commands untouched', () => {
    expect(sanitizeUploadTraceCommand('zplc config set dhcp 1')).toBe('zplc config set dhcp 1');
  });
});

describe('formatChunkTrace', () => {
  it('summarizes data chunks without dumping raw hex', () => {
    expect(formatChunkTrace('zplc sched data', 2, 9, 16)).toBe('zplc sched data <16 bytes hex> (2/9)');
  });
});
