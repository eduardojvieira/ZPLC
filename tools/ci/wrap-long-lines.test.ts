// VF-017: the wrapper cuts long comments and strings without changing what the code does.
import { describe, expect, it } from 'bun:test';
import ts from 'typescript';

import { wrapFile, wrapWords } from './wrap-long-lines';

const LIMIT = 60;
const wrap = (text: string, file = 'a.ts') => wrapFile(file, text, LIMIT);
const evaluates = (text: string): unknown => {
  const { outputText } = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports: Record<string, unknown> = {};
  new Function('exports', outputText)(exports);
  return exports;
};

describe('VF-017 wrap-long-lines: words', () => {
  it('breaks at a space and keeps a word longer than the line whole', () => {
    expect(wrapWords(['aaa', 'bbb', 'cc'], '// ', '// ', 10)).toEqual(['// aaa bbb', '// cc']);
    expect(wrapWords(['x'.repeat(30)], '// ', '// ', 10)).toEqual([`// ${'x'.repeat(30)}`]);
  });
});

describe('VF-017 wrap-long-lines: comments', () => {
  const words = 'the quick brown fox jumps over the lazy dog and keeps running far away';

  it('re-wraps a line comment under the same indent', () => {
    const out = wrap(`function f() {\n  // ${words}\n  return 1;\n}\n`);
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
    expect(out).toContain('  // the quick brown');
    expect(out.replace(/\n\s*\/\/ /g, ' ')).toContain(words);
  });

  it('moves a trailing comment above its code, and keeps the code', () => {
    const out = wrap(`const a = 1; // ${words}\n`);
    expect(out.trimEnd().split('\n').at(-1)).toBe('const a = 1;');
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
  });

  it('leaves a comment that a tool reads', () => {
    const directive = `// eslint-disable-next-line ${words}\nconst a = 1;\n`;
    expect(wrap(directive)).toBe(directive);
  });

  it('turns a one-line block comment into a block, and keeps the code that follows it', () => {
    const out = wrap(`type T = {\n  /** ${words} */ field: string;\n};\n`);
    expect(out).toContain('field: string;');
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
  });

  it('continues a line of a block comment on a new * line', () => {
    const out = wrap(`/**\n * ${words}\n */\nconst a = 1;\n`);
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
  });
});

describe('VF-017 wrap-long-lines: strings', () => {
  const sentence = 'a sentence long enough to cross the limit of the line and then some more words after it';

  it('cuts a string argument at a space, with the same value', () => {
    const source = `export const value = [\n  '${sentence}',\n];\n`;
    const out = wrap(source);
    expect(out).toContain("' +\n");
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
    expect(evaluates(out)).toEqual(evaluates(source));
  });

  it('cuts a template with an interpolation, with the same value', () => {
    const source = `const who = 'ZPLC';\nexport const value = \`${sentence} \${who} and the end\`;\n`;
    const out = wrap(source);
    expect(evaluates(out)).toEqual(evaluates(source));
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
  });

  it('cuts a string with no space where no escape is near', () => {
    const source = `export const value = '${'abcdefgh'.repeat(12)}';\n`;
    const out = wrap(source);
    expect(evaluates(out)).toEqual(evaluates(source));
    expect(out.split('\n').every((line) => line.length <= LIMIT)).toBe(true);
  });

  it('never cuts a property name, an import specifier, a type, a tagged template or the object of a call', () => {
    const cases = [
      `const o = {\n  '${sentence}': 1,\n};\n`,
      `import x from '${'./a-very-long-module-name-'.repeat(4)}';\n`,
      `type T = '${sentence}';\n`,
      `const s = String.raw\`${sentence}\`;\n`,
      `const n = '${sentence}'.length;\n`,
    ];
    for (const source of cases) expect(wrap(source)).toBe(source);
  });

  it('leaves a short string that only sits at the end of a long line', () => {
    const source = `const value = someFunctionWithAVeryLongName(argumentNumberOne, argumentNumberTwo, argumentThree, 'key');\n`;
    expect(wrap(source)).toBe(source);
  });

  it('writes a JSX attribute string as an expression, and leaves one that spans lines', () => {
    const long = Array.from({ length: 12 }, (_, index) => `class-${index}`).join(' ');
    const out = wrap(`const a = <div className="${long}" />;\n`, 'a.tsx');
    expect(out).toContain('className={"');
    expect(out).toContain('" +\n');
    const multi = `const a = <div className="${long}\n    tail" />;\n`;
    expect(wrap(multi, 'a.tsx')).toBe(multi);
  });

  it('is a fixed point: wrapping the result again changes nothing', () => {
    const source = `export const value = [\n  '${sentence}',\n  // ${sentence}\n];\n`;
    const once = wrap(source);
    expect(wrap(once)).toBe(once);
  });
});
