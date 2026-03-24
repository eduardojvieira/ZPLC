import { describe, expect, it } from 'bun:test';

import { resolveProgramSource } from '../utils/programSourceResolution';

describe('resolveProgramSource', () => {
  it('resolves LD task references to visual editor json files', () => {
    const result = resolveProgramSource('main.ld', [
      {
        name: 'main.ld.json',
        content: '{"nodes":[],"edges":[]}',
        language: 'LD',
      },
    ]);

    expect(result).toEqual({
      name: 'main',
      content: '{"nodes":[],"edges":[]}',
      language: 'LD',
    });
  });

  it('resolves exact ST task references unchanged', () => {
    const result = resolveProgramSource('main.st', [
      {
        name: 'main.st',
        content: 'PROGRAM Main\nEND_PROGRAM',
        language: 'ST',
      },
    ]);

    expect(result).toEqual({
      name: 'main',
      content: 'PROGRAM Main\nEND_PROGRAM',
      language: 'ST',
    });
  });

  it('returns null when no alias matches', () => {
    const result = resolveProgramSource('main.ld', [
      {
        name: 'other.ld.json',
        content: '{}',
        language: 'LD',
      },
    ]);

    expect(result).toBeNull();
  });
});
