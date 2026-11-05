import { describe, expect, it } from 'bun:test';

import { parseReading, readingShape } from './readingMarkdown';
import type { ReadingBlock, ReadingDirective } from './readingTypes';

const clean = (markdown: string): ReadingBlock[] => {
  const result = parseReading(markdown);
  expect(result.errors).toEqual([]);
  return result.blocks;
};
const fence = (kind: string, body: string): string => `\`\`\`${kind}\n${body}\n\`\`\``;
const directiveOf = (markdown: string): ReadingDirective => {
  const block = clean(markdown)[0];
  if (block?.type !== 'directive') throw new Error('not a directive');
  return block.directive;
};
const errorsOf = (markdown: string) => parseReading(markdown).errors;

describe('the reading Markdown subset (LRN-040)', () => {
  it('parses headings of depth 2 and 3, paragraphs and rules', () => {
    expect(clean('## One\n\nA paragraph\nover two lines.\n\n---\n\n### Two')).toEqual([
      { type: 'heading', depth: 2, children: [{ type: 'text', value: 'One' }] },
      { type: 'paragraph', children: [{ type: 'text', value: 'A paragraph over two lines.' }] },
      { type: 'rule' },
      { type: 'heading', depth: 3, children: [{ type: 'text', value: 'Two' }] },
    ]);
  });

  it('parses strong, emphasis, inline code and backslash escapes, and keeps snake_case names as text', () => {
    expect(clean('A **strong *and em*** `x < y` \\*plain\\* My_Var_1')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'A ' },
          {
            type: 'strong',
            children: [
              { type: 'text', value: 'strong ' },
              { type: 'emphasis', children: [{ type: 'text', value: 'and em' }] },
            ],
          },
          { type: 'text', value: ' ' },
          { type: 'code', value: 'x < y' },
          { type: 'text', value: ' *plain* My_Var_1' },
        ],
      },
    ]);
  });

  it('parses bullet and ordered lists with one nested level', () => {
    expect(clean('- one\n- two\n  - nested a\n  - nested b\n- three\n\n1. first\n2. second')).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [
          [{ type: 'paragraph', children: [{ type: 'text', value: 'one' }] }],
          [
            { type: 'paragraph', children: [{ type: 'text', value: 'two' }] },
            {
              type: 'list',
              ordered: false,
              items: [
                [{ type: 'paragraph', children: [{ type: 'text', value: 'nested a' }] }],
                [{ type: 'paragraph', children: [{ type: 'text', value: 'nested b' }] }],
              ],
            },
          ],
          [{ type: 'paragraph', children: [{ type: 'text', value: 'three' }] }],
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [{ type: 'paragraph', children: [{ type: 'text', value: 'first' }] }],
          [{ type: 'paragraph', children: [{ type: 'text', value: 'second' }] }],
        ],
      },
    ]);
  });

  it('rejects a second nested list level, at its line', () => {
    expect(errorsOf('- a\n  - b\n    - c')).toEqual([{ line: 3, message: 'lists nest one level at most' }]);
  });

  it('parses a pipe table with an alignment row and escaped pipes', () => {
    expect(clean('| In | Out |\n|:--|--:|\n| **a** | b \\| c |')).toEqual([
      {
        type: 'table',
        header: [[{ type: 'text', value: 'In' }], [{ type: 'text', value: 'Out' }]],
        align: ['left', 'right'],
        rows: [[[{ type: 'strong', children: [{ type: 'text', value: 'a' }] }], [{ type: 'text', value: 'b | c' }]]],
      },
    ]);
    expect(errorsOf('| a | b |\n|---|---|\n| only |')).toEqual([{ line: 3, message: 'a table row has 1 cells but the header has 2' }]);
  });

  it('parses note, tip and warning callouts whose content is blocks', () => {
    expect(clean('> [!TIP]\n> Use **it**.\n>\n> - one')).toEqual([
      {
        type: 'callout',
        kind: 'tip',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', value: 'Use ' },
              { type: 'strong', children: [{ type: 'text', value: 'it' }] },
              { type: 'text', value: '.' },
            ],
          },
          { type: 'list', ordered: false, items: [[{ type: 'paragraph', children: [{ type: 'text', value: 'one' }] }]] },
        ],
      },
    ]);
    expect(clean('> [!NOTE]\n> a')[0]).toMatchObject({ kind: 'note' });
    expect(clean('> [!WARNING]\n> a')[0]).toMatchObject({ kind: 'warning' });
    expect(errorsOf('text\n\n> plain quote')).toEqual([{ line: 3, message: 'a quote must start with [!NOTE], [!TIP] or [!WARNING]' }]);
  });

  it('keeps fenced code verbatim, including HTML and links, with its language', () => {
    expect(clean('```st\n<b>x</b> [a](b)\nIF A THEN\n```\n\n```\nplain\n```')).toEqual([
      { type: 'code', lang: 'st', value: '<b>x</b> [a](b)\nIF A THEN' },
      { type: 'code', lang: '', value: 'plain' },
    ]);
    expect(errorsOf('```st\nno end')).toEqual([{ line: 1, message: 'the code fence is never closed' }]);
  });

  it('parses an image alone on its line from images/ as svg or png', () => {
    expect(clean('![A relay panel](images/relay-panel.svg)\n\n![Photo](images/p.png)')).toEqual([
      { type: 'image', src: 'images/relay-panel.svg', alt: 'A relay panel' },
      { type: 'image', src: 'images/p.png', alt: 'Photo' },
    ]);
  });

  it('parses the four live blocks into typed data with their line', () => {
    const block = parseReading(`text\n\n${fence('ld-figure', 'src: reading/seal.ld.json\nrung: 2\ncaption: Seal-in')}`).blocks[1];
    expect(block).toEqual({
      type: 'directive',
      line: 3,
      directive: { kind: 'ld-figure', data: { src: 'reading/seal.ld.json', rung: 2, caption: 'Seal-in' } },
    });
    expect(
      directiveOf(
        fence(
          'ld-try',
          'src: reading/try.ld.json\ninputs:\n  - { name: Button, kind: push }\noutputs: [Lamp]\ntiming: [Button, Lamp]\ncaption: Press',
        ),
      ),
    ).toEqual({
      kind: 'ld-try',
      data: {
        src: 'reading/try.ld.json',
        inputs: [{ name: 'Button', kind: 'push' }],
        outputs: ['Lamp'],
        timing: ['Button', 'Lamp'],
        caption: 'Press',
      },
    });
    expect(
      directiveOf(
        fence('timing', 'span: 6000\nsignals:\n  - { name: Button, edges: [500, 1500] }\nmarks:\n  - { from: 1500, to: 4500, label: PT }'),
      ),
    ).toEqual({
      kind: 'timing',
      data: {
        span: 6000,
        signals: [{ name: 'Button', edges: [500, 1500] }],
        marks: [{ from: 1500, to: 4500, label: 'PT' }],
      },
    });
    expect(
      directiveOf(
        fence('quiz', 'question: Q?\noptions:\n  - { text: "TRUE", correct: true, feedback: Yes }\n  - { text: "FALSE", feedback: No }'),
      ),
    ).toEqual({
      kind: 'quiz',
      data: {
        question: 'Q?',
        options: [
          { text: 'TRUE', correct: true, feedback: 'Yes' },
          { text: 'FALSE', feedback: 'No' },
        ],
      },
    });
  });

  it('rejects raw HTML outside code, with the line', () => {
    expect(errorsOf('fine\n\nA <b>bold</b> word')).toEqual([
      { line: 3, message: 'raw HTML is not allowed' },
      { line: 3, message: 'raw HTML is not allowed' },
    ]);
    expect(errorsOf('<!-- note -->')).toEqual([{ line: 1, message: 'raw HTML is not allowed' }]);
    expect(errorsOf('a < b and `<b>` are fine')).toEqual([]);
  });

  it('rejects links of every kind, with the line', () => {
    const message = 'links are not allowed';
    expect(errorsOf('ok\nsee [the docs](https://example.com)')).toEqual([{ line: 2, message }]);
    expect(errorsOf('<https://example.com>')).toEqual([{ line: 1, message }]);
    expect(errorsOf('go to https://example.com now')).toEqual([{ line: 1, message }]);
    expect(errorsOf('a [ref][1]')).toEqual([{ line: 1, message }]);
  });

  it('rejects level-1 headings and headings deeper than 3, with the line', () => {
    expect(errorsOf('## fine\n\n# Title')).toEqual([
      { line: 3, message: 'level-1 headings are not allowed: the title comes from the lesson text' },
    ]);
    expect(errorsOf('#### Deep')).toEqual([{ line: 1, message: 'headings deeper than level 3 are not allowed' }]);
  });

  it('rejects an image that is not alone, has a bad src or has no alt text', () => {
    expect(errorsOf('see ![x](images/a.svg) here')).toEqual([{ line: 1, message: 'an image must be alone on its line' }]);
    expect(errorsOf('![x](reading/a.svg)')).toEqual([{ line: 1, message: 'an image src must be images/<name>.svg or images/<name>.png' }]);
    expect(errorsOf('![x](images/a.gif)')).toEqual([{ line: 1, message: 'an image src must be images/<name>.svg or images/<name>.png' }]);
    expect(errorsOf('![x](images/../a.svg)')).toEqual([
      { line: 1, message: 'an image src must be images/<name>.svg or images/<name>.png' },
    ]);
    expect(errorsOf('![](images/a.svg)')).toEqual([{ line: 1, message: 'an image needs alt text' }]);
  });

  it('rejects an unknown live-block kind and invalid YAML, with the line of the fence', () => {
    expect(errorsOf(`ok\n\n${fence('ld-sim', 'a: 1')}`)).toEqual([{ line: 3, message: 'unknown live block "ld-sim"' }]);
    expect(errorsOf(fence('quiz', 'question: [unclosed'))[0]).toMatchObject({ line: 1 });
    expect(errorsOf(fence('quiz', 'question: [unclosed'))[0]!.message).toStartWith('quiz: invalid YAML');
    expect(errorsOf(fence('quiz', '- just a list'))).toEqual([{ line: 1, message: 'quiz: the body must be a YAML mapping' }]);
  });

  it('does not return a block for a live block that fails its schema', () => {
    expect(parseReading(fence('quiz', 'question: Q?\noptions: []')).blocks).toEqual([]);
  });

  it('never puts markup or a URL in its output: the only strings are text and code values', () => {
    const { blocks } = parseReading('## A\n\nSome <script> and [x](y) text with `code`.\n');
    expect(JSON.stringify(blocks)).not.toContain('<script');
    expect(JSON.stringify(blocks)).not.toContain('](');
  });
});

describe('the live-block limits (LRN-040)', () => {
  const quiz = (options: string): string => fence('quiz', `question: Q?\noptions:\n${options}`);
  const ok = '  - { text: A, correct: true, feedback: yes }\n  - { text: B, feedback: no }';
  const problem = (markdown: string): string[] => errorsOf(markdown).map((error) => error.message);

  it('quiz: 2 to 4 options, exactly one correct, feedback on each', () => {
    expect(problem(quiz(ok))).toEqual([]);
    expect(problem(quiz('  - { text: A, correct: true, feedback: yes }'))).toEqual(['quiz: needs 2 to 4 options']);
    expect(problem(quiz(`${ok}\n  - { text: C, feedback: c }\n  - { text: D, feedback: d }\n  - { text: E, feedback: e }`))).toEqual([
      'quiz: needs 2 to 4 options',
    ]);
    expect(problem(quiz('  - { text: A, feedback: a }\n  - { text: B, feedback: b }'))).toEqual([
      'quiz: exactly one option must be correct',
    ]);
    expect(problem(quiz('  - { text: A, correct: true, feedback: a }\n  - { text: B, correct: true, feedback: b }'))).toEqual([
      'quiz: exactly one option must be correct',
    ]);
    expect(problem(quiz('  - { text: A, correct: true, feedback: a }\n  - { text: B, feedback: "" }'))).toEqual([
      'quiz: option 2 needs feedback',
    ]);
  });

  const timing = (body: string): string => fence('timing', body);
  it('timing: span above 0, 1 to 8 signals, edges ascending and within the span, marks inside the span with a label', () => {
    const base = 'span: 1000\nsignals:\n  - { name: A, edges: [100, 200] }';
    expect(problem(timing(base))).toEqual([]);
    expect(problem(timing('span: 0\nsignals:\n  - { name: A, edges: [] }'))).toEqual(['timing: span must be a number above 0']);
    expect(problem(timing('span: 1000\nsignals: []'))).toEqual(['timing: needs 1 to 8 signals']);
    const nine = Array.from({ length: 9 }, (_, i) => `  - { name: S${i}, edges: [] }`).join('\n');
    expect(problem(timing(`span: 1000\nsignals:\n${nine}`))).toEqual(['timing: needs 1 to 8 signals']);
    expect(problem(timing('span: 1000\nsignals:\n  - { name: A, edges: [200, 200] }'))).toEqual([
      'timing: the edges of A must be strictly ascending',
    ]);
    expect(problem(timing('span: 1000\nsignals:\n  - { name: A, edges: [200, 1001] }'))).toEqual([
      'timing: the edges of A must lie within the span',
    ]);
    expect(problem(timing(`${base}\nmarks:\n  - { from: 300, to: 300, label: PT }`))).toEqual(['timing: mark 1 needs from < to']);
    expect(problem(timing(`${base}\nmarks:\n  - { from: 300, to: 1200, label: PT }`))).toEqual(['timing: mark 1 must lie within the span']);
    expect(problem(timing(`${base}\nmarks:\n  - { from: 300, to: 400, label: "" }`))).toEqual(['timing: mark 1 needs a label']);
  });

  const tryBlock = (body: string): string => fence('ld-try', body);
  const tryBase = 'src: reading/t.ld.json\ninputs:\n  - { name: B, kind: push }\noutputs: [L]';
  it('ld-try: src under reading/ ending .ld.json, 1 to 8 inputs of kind push or switch, 1 to 8 outputs, timing names known', () => {
    expect(problem(tryBlock(tryBase))).toEqual([]);
    expect(problem(tryBlock(tryBase.replace('reading/t.ld.json', 'projects/t.ld.json')))).toEqual([
      'ld-try: src must be a file under reading/ ending .ld.json',
    ]);
    expect(problem(tryBlock(tryBase.replace('t.ld.json', 't.json')))).toEqual([
      'ld-try: src must be a file under reading/ ending .ld.json',
    ]);
    expect(problem(tryBlock(tryBase.replace('push', 'toggle')))).toEqual(['ld-try: input 1 needs a name and a kind of push or switch']);
    expect(problem(tryBlock('src: reading/t.ld.json\ninputs: []\noutputs: [L]'))).toEqual(['ld-try: needs 1 to 8 inputs']);
    expect(problem(tryBlock('src: reading/t.ld.json\ninputs:\n  - { name: B, kind: push }\noutputs: []'))).toEqual([
      'ld-try: needs 1 to 8 outputs',
    ]);
    expect(problem(tryBlock(`${tryBase}\ntiming: [B, Ghost]`))).toEqual([
      'ld-try: timing names "Ghost", which is neither an input nor an output',
    ]);
  });

  it('ld-figure: src under reading/ and a positive integer rung', () => {
    const figure = (body: string): string => fence('ld-figure', body);
    expect(problem(figure('src: reading/f.ld.json\nrung: 1'))).toEqual([]);
    expect(problem(figure('src: ../f.ld.json'))).toEqual(['ld-figure: src must be a file under reading/']);
    expect(problem(figure('src: starter/f.ld.json'))).toEqual(['ld-figure: src must be a file under reading/']);
    expect(problem(figure('src: reading/f.ld.json\nrung: 0'))).toEqual(['ld-figure: rung must be a positive integer']);
    expect(problem(figure('src: reading/f.ld.json\nrung: 1.5'))).toEqual(['ld-figure: rung must be a positive integer']);
  });

  it('rejects a key a live block does not know', () => {
    expect(problem(fence('ld-figure', 'src: reading/f.ld.json\nextra: 1'))).toEqual(['ld-figure: unknown key "extra"']);
  });
});

describe('the reading parity shape (LRN-042)', () => {
  const page = (lang: 'en' | 'es'): string =>
    [
      '## Title',
      lang === 'en' ? 'Some words.' : 'Unas palabras.',
      '- a\n  - b\n- c',
      '| x | y |\n|:-:|---|\n| 1 | 2 |',
      '> [!NOTE]\n> n',
      '```st\nA := B;\n```',
      '![Alt](images/a.svg)',
      fence('ld-figure', `src: reading/f.ld.json\ncaption: ${lang === 'en' ? 'Fig' : 'Fig es'}`),
      fence(
        'quiz',
        `question: ${lang === 'en' ? 'Q?' : '¿P?'}\noptions:\n` +
          `  - { text: A, correct: true, feedback: ${lang} }\n  - { text: B, feedback: ${lang} }`,
      ),
      fence('timing', `span: 100\nsignals:\n  - { name: A, edges: [10] }\ncaption: ${lang}`),
      '---',
    ].join('\n\n');

  it('is equal for two languages that differ only in text, and JSON-comparable', () => {
    const en = readingShape(clean(page('en')));
    const es = readingShape(clean(page('es')));
    expect(JSON.stringify(en)).toBe(JSON.stringify(es));
    expect(JSON.parse(JSON.stringify(en))).toEqual(en as object);
  });

  it('differs for another block kind, heading depth, list nesting, item count, table size, alignment, callout, code lang or image', () => {
    const base = JSON.stringify(readingShape(clean(page('en'))));
    const changed = (from: string, to: string): string => JSON.stringify(readingShape(clean(page('en').replace(from, to))));
    for (const [from, to] of [
      ['## Title', '### Title'],
      ['- a\n  - b\n- c', '- a\n- b\n- c'],
      ['- a\n  - b\n- c', '- a\n  - b'],
      ['| x | y |\n|:-:|---|\n| 1 | 2 |', '| x | y |\n|:-:|---|\n| 1 | 2 |\n| 3 | 4 |'],
      ['|:-:|---|', '|:--|---|'],
      ['[!NOTE]', '[!TIP]'],
      ['```st', '```il'],
      ['images/a.svg', 'images/b.svg'],
      ['\n\n---', ''],
    ] as const)
      expect(changed(from, to)).not.toBe(base);
    expect(JSON.stringify(readingShape(clean(`${page('en')}\n\nMore.`)))).not.toBe(base);
  });

  it('keeps every non-text field of a live block: src, rung, names, kinds, edges, marks, which option is correct', () => {
    const shape = (markdown: string): string => JSON.stringify(readingShape(clean(markdown)));
    const figure = (rung: number): string => fence('ld-figure', `src: reading/f.ld.json\nrung: ${rung}`);
    expect(shape(figure(1))).not.toBe(shape(figure(2)));
    const timingOf = (edge: number, label: string): string =>
      fence('timing', `span: 100\nsignals:\n  - { name: A, edges: [${edge}] }\nmarks:\n  - { from: 1, to: 2, label: ${label} }`);
    expect(shape(timingOf(10, 'PT'))).not.toBe(shape(timingOf(20, 'PT')));
    expect(shape(timingOf(10, 'PT'))).not.toBe(shape(timingOf(10, 'ET')));
    const tryOf = (kind: string): string =>
      fence('ld-try', `src: reading/t.ld.json\ninputs:\n  - { name: B, kind: ${kind} }\noutputs: [L]`);
    expect(shape(tryOf('push'))).not.toBe(shape(tryOf('switch')));
    const quizOf = (first: boolean): string =>
      fence(
        'quiz',
        `question: Q\noptions:\n  - { text: A, correct: ${first}, feedback: f }\n  - { text: B, correct: ${!first}, feedback: f }`,
      );
    expect(shape(quizOf(true))).not.toBe(shape(quizOf(false)));
  });
});
