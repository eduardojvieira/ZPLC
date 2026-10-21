// LNG-016: document formatting is deterministic and idempotent, and changes only the white space at the ends of lines.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Glob } from 'bun';
import { tokenize } from '@zplc/compiler';
import { formatEdits, formatSource } from './format';

const MESSY = `PROGRAM Main
VAR
x : INT;
      y : BOOL;   
END_VAR
IF x > 1 THEN
y := TRUE;
  ELSIF x = 0 THEN
        y := FALSE;
ELSE
y := y;
END_IF;
   CASE x OF
1:
y := TRUE;
2: y := FALSE;
ELSE
y := TRUE;
END_CASE;
FOR x := 0 TO 10 DO
(* a comment
   that spans two lines *)
y := y AND
(x > 3);
END_FOR;
REPEAT
x := x + 1;
UNTIL x > 5
END_REPEAT;
END_PROGRAM
`;

const WANTED = `PROGRAM Main
  VAR
    x : INT;
    y : BOOL;
  END_VAR
  IF x > 1 THEN
    y := TRUE;
  ELSIF x = 0 THEN
    y := FALSE;
  ELSE
    y := y;
  END_IF;
  CASE x OF
    1:
      y := TRUE;
    2: y := FALSE;
    ELSE
      y := TRUE;
  END_CASE;
  FOR x := 0 TO 10 DO
    (* a comment
   that spans two lines *)
    y := y AND
      (x > 3);
  END_FOR;
  REPEAT
    x := x + 1;
  UNTIL x > 5
  END_REPEAT;
END_PROGRAM
`;

describe('document formatting (LNG-016)', () => {
  it('indents by the depth of the blocks, trims the ends of lines, and leaves a block comment as written', () => {
    expect(formatSource(MESSY)).toBe(WANTED);
  });

  it('is idempotent and deterministic', () => {
    const once = formatSource(MESSY);
    expect(formatSource(once)).toBe(once);
    expect(formatSource(MESSY)).toBe(once);
    expect(formatEdits(once)).toEqual([]);
  });

  it('does not add or remove a line, so no breakpoint moves', () => {
    expect(formatSource(MESSY).split('\n')).toHaveLength(MESSY.split('\n').length);
  });

  it('uses the indentation the editor asks for, and replaces tabs', () => {
    expect(formatSource('PROGRAM P\nVAR\n\tA : INT;\nEND_VAR\nEND_PROGRAM\n', { indentSize: 4 })).toBe(
      'PROGRAM P\n    VAR\n        A : INT;\n    END_VAR\nEND_PROGRAM\n',
    );
  });

  it('keeps the line endings of a file that has CRLF', () => {
    expect(formatSource('PROGRAM P\r\nVAR\r\nA : INT;\r\nEND_VAR\r\nEND_PROGRAM\r\n')).toBe(
      'PROGRAM P\r\n  VAR\r\n    A : INT;\r\n  END_VAR\r\nEND_PROGRAM\r\n',
    );
  });

  it('leaves a source the lexer cannot read as it is', () => {
    const unreadable = "PROGRAM P\nVAR\nA : STRING := 'open;\nEND_VAR\nEND_PROGRAM\n";
    expect(formatEdits(unreadable)).toEqual([]);
  });

  it('never changes a token of the example programs, adds a line, or fails to be idempotent', () => {
    const root = join(import.meta.dir, '../..');
    const files = [...new Glob('projects/**/*.st').scanSync({ cwd: root })].sort();
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const text = readFileSync(join(root, file), 'utf8');
      const formatted = formatSource(text);
      const values = (source: string) => tokenize(source).map((token) => `${token.type}:${token.value}`);
      expect(values(formatted)).toEqual(values(text));
      expect(formatted.split('\n')).toHaveLength(text.split('\n').length);
      expect(formatSource(formatted)).toBe(formatted);
    }
  });
});
