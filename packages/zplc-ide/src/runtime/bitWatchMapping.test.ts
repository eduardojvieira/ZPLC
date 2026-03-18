import { describe, expect, it } from 'bun:test';

import { readFileSync } from 'node:fs';
import { compileMultiTaskProject, findVariable } from '../compiler';

describe('bit-addressed watch mapping', () => {
  it('preserves distinct bit offsets for sibling OPI BOOL outputs', () => {
    const projectConfig = JSON.parse(
      readFileSync(new URL('../../projects/pico_blinky/zplc.json', import.meta.url), 'utf8'),
    );
    const programSources = [
      {
        name: 'main.st',
        language: 'ST' as const,
        content: readFileSync(new URL('../../projects/pico_blinky/src/main.st', import.meta.url), 'utf8'),
      },
    ];

    const result = compileMultiTaskProject(projectConfig, programSources);
    const ledOutput = findVariable(result.debugMap, 'LED_Output');
    const pwr = findVariable(result.debugMap, 'PWR');

    expect(ledOutput).not.toBeNull();
    expect(pwr).not.toBeNull();
    expect(ledOutput?.absoluteAddr).toBe(0x1000);
    expect(pwr?.absoluteAddr).toBe(0x1000);
    expect(ledOutput?.varInfo.bitOffset).toBe(0);
    expect(pwr?.varInfo.bitOffset).toBe(1);
  });
});
