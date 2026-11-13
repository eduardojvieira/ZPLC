import { describe, expect, test } from 'bun:test';
import { locateJsonPointer } from './jsonPlace';

const TEXT = [
  '{',
  '  "id": "blink",',
  '  "expectations": [',
  '    { "kind": "output", "atMs": 0 },',
  '    {',
  '      "kind": "output"',
  '    }',
  '  ]',
  '}',
].join('\n');

describe('jsonPlace', () => {
  test('FND-005 a JSON pointer into expectations gives the line of that object', () => {
    expect(locateJsonPointer(TEXT, '/expectations/0')).toEqual({ line: 4, column: 5 });
    expect(locateJsonPointer(TEXT, '/expectations/1')).toEqual({ line: 5, column: 5 });
    expect(locateJsonPointer(TEXT, '/expectations/1/kind')).toEqual({ line: 6, column: 15 });
    expect(locateJsonPointer(TEXT, '/id')).toEqual({ line: 2, column: 9 });
    expect(locateJsonPointer(TEXT, '')).toEqual({ line: 1, column: 1 });
  });

  test('FND-005 a pointer that is not in the text gives nothing', () => {
    expect(locateJsonPointer(TEXT, '/expectations/2')).toBeUndefined();
    expect(locateJsonPointer(TEXT, '/missing')).toBeUndefined();
    expect(locateJsonPointer('{ "a": ', '/a')).toBeUndefined();
    expect(locateJsonPointer(TEXT, 'expectations')).toBeUndefined();
  });

  test('FND-005 an escaped key is found by its unescaped name', () => {
    expect(locateJsonPointer('{"a/b": {"~": 1}}', '/a~1b/~0')).toEqual({ line: 1, column: 15 });
  });
});
