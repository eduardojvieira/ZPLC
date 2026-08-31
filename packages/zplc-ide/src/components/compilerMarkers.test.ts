import { describe, expect, it } from 'bun:test';
import { compilerMarkersForFile } from './compilerMarkers';

describe('compilerMarkersForFile', () => {
  it('uses only exact paths and clamps valid ST coordinates', () => {
    const messages = [
      { type: 'error' as const, message: 'bad', file: 'src/Motor.st', line: 9, column: 99, timestamp: new Date() },
      { type: 'error' as const, message: 'global', file: 'src/Motor.st', line: 0, column: 0, timestamp: new Date() },
      { type: 'warning' as const, message: 'other', file: 'Motor.st', line: 1, column: 1, timestamp: new Date() },
    ];
    expect(compilerMarkersForFile(messages, 'src/Motor.st', 3, () => 4)).toEqual([{ message: 'bad', type: 'error', line: 3, column: 4, endColumn: 4 }]);
  });

  it('marks one character when it exists and keeps EOL markers valid', () => {
    const message = { type: 'error' as const, message: 'bad', file: 'src/Motor.st', line: 1, column: 2, timestamp: new Date() };
    expect(compilerMarkersForFile([message], 'src/Motor.st', 1, () => 5)[0]).toMatchObject({ column: 2, endColumn: 3 });
    expect(compilerMarkersForFile([{ ...message, column: 99 }], 'src/Motor.st', 1, () => 5)[0]).toMatchObject({ column: 5, endColumn: 5 });
  });
});
