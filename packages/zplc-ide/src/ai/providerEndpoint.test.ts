import { describe, expect, test } from 'bun:test';

import { canonicalAiEndpoint, isLoopbackAiEndpoint } from './providerEndpoint';

describe('the endpoints the assistant may talk to (AIX-006, AI-17)', () => {
  test('accepts exactly the loopback hosts over http, in their canonical form', () => {
    expect(canonicalAiEndpoint('http://localhost:11434')).toBe('http://localhost:11434');
    expect(canonicalAiEndpoint('http://127.0.0.1:1234/')).toBe('http://127.0.0.1:1234');
    expect(canonicalAiEndpoint('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(canonicalAiEndpoint('http://[0:0:0:0:0:0:0:1]')).toBe('http://[::1]');
    expect(canonicalAiEndpoint('http://LOCALHOST:11434')).toBe('http://localhost:11434');
    for (const endpoint of ['http://localhost:11434', 'http://127.0.0.1:1234', 'http://[::1]:8080'])
      expect(isLoopbackAiEndpoint(endpoint)).toBe(true);
  });

  test('accepts a hosted provider only over https, and that one is not loopback', () => {
    expect(canonicalAiEndpoint('https://api.openai.com')).toBe('https://api.openai.com');
    expect(canonicalAiEndpoint('https://api.example.test/base/')).toBe('https://api.example.test/base');
    expect(isLoopbackAiEndpoint('https://api.example.test')).toBe(false);
  });

  test('refuses a name that only looks like localhost or resolves elsewhere', () => {
    for (const endpoint of [
      'http://localhost.',
      'http://localhost.evil.test',
      'http://evil-localhost',
      'http://127.0.0.1.nip.io',
      'http://localhost@evil.test',
      'http://user:pass@localhost',
    ])
      expect(canonicalAiEndpoint(endpoint), endpoint).toBeNull();
    expect(isLoopbackAiEndpoint('https://localhost.evil.test')).toBe(false);
  });

  test('refuses another loopback address, every other IPv6 form and a plain-http host', () => {
    for (const endpoint of [
      'http://127.0.0.2',
      'http://127.1.2.3',
      'http://0.0.0.0',
      'http://[::]',
      'http://[::ffff:127.0.0.1]',
      'http://[fe80::1]',
      'http://[::2]',
      'http://192.168.1.5',
      'http://example.test',
    ])
      expect(canonicalAiEndpoint(endpoint), endpoint).toBeNull();
  });

  test('refuses another scheme, a query, a fragment and anything that is not a url', () => {
    for (const endpoint of [
      'ftp://localhost',
      'file:///etc/passwd',
      'ws://localhost',
      'http://localhost?x=1',
      'http://localhost#x',
      '',
      'localhost',
      7,
    ])
      expect(canonicalAiEndpoint(endpoint), String(endpoint)).toBeNull();
  });
});
