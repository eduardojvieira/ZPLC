import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

import type { LessonText } from '../../packages/zplc-ide/src/learn/lessonPackage';
import {
  BASELINE_FILE,
  TABLE_FILE,
  check,
  evaluate,
  hasWord,
  loadInput,
  mappingProblems,
  offenceKeys,
  ratchet,
  renderTable,
  type Input,
  type LessonFacts,
  type Rule,
} from './lesson-didactics';

const text = (patch: Partial<LessonText> = {}, run = 'Press Check.'): LessonText => ({
  schemaVersion: 1,
  title: 'T',
  summary: 'S',
  scope: 'Scope',
  objectives: ['O'],
  stages: [{ key: 'run', title: 'Run', body: run, checkpoint: 'ok' }],
  hints: [{ level: 1, text: 'H' }],
  faultCases: [],
  ...patch,
});
const lesson = (id: string, patch: Partial<LessonFacts> = {}): LessonFacts => ({
  id,
  module: 1,
  languages: ['ST'],
  minutes: 10,
  reading: { en: true, es: true },
  readingText: { en: '', es: '' },
  codeLines: 2,
  hasWrongSet: true,
  text: { en: text(), es: text({}, 'Pulse Comprobar.') },
  ...patch,
});
const base = (lessons: LessonFacts[], patch: Partial<Input> = {}): Input => ({
  lessons,
  checkLabel: { en: 'Check', es: 'Comprobar' },
  ideas: { ideas: {}, practises: {} },
  terms: [],
  ...patch,
});
const offending = (input: Input): string[] => offenceKeys(evaluate(input));

describe('rules, each failing when broken', () => {
  test('a clean lesson breaks nothing', () => expect(offending(base([lesson('a')]))).toEqual([]));

  test('reading: a missing page in one language', () => {
    const input = base([lesson('a', { reading: { en: true, es: false } })]);
    expect(offending(input)).toEqual(['a:reading']);
    expect(evaluate(input)[0]!.offences.reading).toBe('no es');
  });

  test('check: the Run stage must name the control by its label in each language', () => {
    expect(offending(base([lesson('a', { text: { en: text({}, 'Run it.'), es: text({}, 'Pulse Comprobar.') } })]))).toEqual(['a:check']);
    // The English label in the Spanish text is the wrong label.
    expect(offending(base([lesson('a', { text: { en: text(), es: text({}, 'Pulse Check.') } })]))).toEqual(['a:check']);
    // The label comes from the catalogue passed in, not from a word of the script.
    expect(offending(base([lesson('a')], { checkLabel: { en: 'Grade', es: 'Calificar' } }))).toEqual(['a:check']);
  });

  test('check: CRS-019 a Run stage that names Check through the catalogue placeholder names it', () => {
    const named = (run: string) => ({ text: { en: text({}, run), es: text({}, run) } });
    expect(offending(base([lesson('a', named('Press {{ui:learn.check}}.'))]))).toEqual([]);
    // Another control, or a key the catalogue lacks, is not the Check control.
    expect(offending(base([lesson('a', named('Press {{ui:toolbar.run.label}}.'))]))).toEqual(['a:check']);
    expect(offending(base([lesson('a', named('Press {{ui:learn.nothing}}.'))]))).toEqual(['a:check']);
  });

  test('vocabulary: a word of the evidence list in any learner field or reading page, as a word, in either language', () => {
    expect(
      offending(base([lesson('a', { text: { en: text({ scope: 'Native POSIX host.' }), es: text({}, 'Pulse Comprobar.') } })])),
    ).toEqual(['a:vocabulary']);
    expect(
      offending(
        base([
          lesson('a', {
            text: {
              en: text({ hints: [{ level: 1, text: 'no hil' }] }),
              es: text({ faultCases: ['sin certificación'] }, 'Pulse Comprobar.'),
            },
          }),
        ]),
      ),
    ).toEqual(['a:vocabulary']);
    expect(offending(base([lesson('a', { readingText: { en: 'Not for HIL use.', es: '' } })]))).toEqual(['a:vocabulary']);
    // Part of a longer word, a name with a hyphen or a placeholder is not the word.
    expect(
      offending(
        base([lesson('a', { text: { en: text({ scope: 'A posixly name, hil-x and {{HIL}}.' }), es: text({}, 'Pulse Comprobar.') } })]),
      ),
    ).toEqual([]);
  });

  test('order: a lesson before the lesson that explains an idea it practises', () => {
    const ideas = { ideas: { scan: { explainedBy: 'explain' } }, practises: { early: ['scan'], explain: ['scan'], late: ['scan'] } };
    expect(offending(base([lesson('early'), lesson('explain'), lesson('late')], { ideas }))).toEqual(['early:order']);
    expect(offending(base([lesson('explain'), lesson('early'), lesson('late')], { ideas }))).toEqual([]);
  });

  test('glossary: a forbidden synonym in the text of its language only', () => {
    const terms = [{ concept: 'belt', en: 'belt', es: 'banda', forbidden: { en: ['strap'], es: ['cinta'] } }];
    const es = (body: string) => text({ summary: body }, 'Pulse Comprobar.');
    expect(offending(base([lesson('a', { text: { en: text(), es: es('La cinta avanza.') } })], { terms }))).toEqual(['a:glossary']);
    expect(
      offending(base([lesson('a', { text: { en: text({ summary: 'The strap moves.' }), es: es('La banda avanza.') } })], { terms })),
    ).toEqual(['a:glossary']);
    expect(
      offending(base([lesson('a', { text: { en: text({ summary: 'A cinta here.' }), es: es('La banda avanza.') } })], { terms })),
    ).toEqual([]);
  });

  test('hasWord ignores case but a control label keeps it', () => {
    expect(hasWord('Use HIL.', 'hil')).toBe(true);
    expect(hasWord('press check', 'Check', true)).toBe(false);
  });
});

describe('mappings', () => {
  test('an idea explained by, or a practice of, an unknown lesson or idea is a problem', () => {
    const input = base([lesson('a')], { ideas: { ideas: { x: { explainedBy: 'gone' } }, practises: { a: ['nope'], b: ['x'] } } });
    expect(mappingProblems(input)).toHaveLength(3);
  });
  test('a term missing from the glossary page is a problem unless the row is still to come', () => {
    const term = { concept: 'c', en: 'rung', es: 'peldaño', forbidden: { en: [], es: [] } };
    const page = { en: 'rung | peldaño', es: 'rung | peldaño' };
    expect(mappingProblems(base([], { terms: [term] }), page)).toEqual([]);
    expect(mappingProblems(base([], { terms: [{ ...term, es: 'escalón' }] }), page)).toHaveLength(1);
    expect(mappingProblems(base([], { terms: [{ ...term, es: 'escalón', glossary: false }] }), page)).toEqual([]);
  });
});

describe('ratchet', () => {
  const rows = evaluate(base([lesson('a', { reading: { en: false, es: false } }), lesson('b')]));
  const table = renderTable(rows);
  test('the baseline matches: nothing to report', () => expect(check(rows, ['a:reading'], table, [])).toEqual([]));
  test('an offence the baseline does not list fails', () =>
    expect(check(rows, [], table, [])).toEqual([expect.stringContaining('new offence a:reading')]));
  test('a stale baseline entry fails: a fixed lesson must leave the list', () => {
    expect(ratchet(rows, ['a:reading', 'b:reading'])).toEqual({ added: [], stale: ['b:reading'] });
    expect(check(rows, ['a:reading', 'b:reading'], table, [])).toEqual([expect.stringContaining('b:reading no longer occurs')]);
  });
  test('a stale table fails', () => expect(check(rows, ['a:reading'], table + 'x', [])).toEqual([expect.stringContaining('is stale')]));
});

describe('the real tree', () => {
  const { input, glossary, problems } = loadInput();
  const rows = evaluate(input);
  const baseline = (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as { offences: string[] }).offences;

  test('the packages and both mappings are sound', () => expect([...problems, ...mappingProblems(input, glossary)]).toEqual([]));
  test('it holds against the baseline and the committed table', () =>
    expect(check(rows, baseline, existsSync(TABLE_FILE) ? readFileSync(TABLE_FILE, 'utf8') : undefined, [])).toEqual([]));
  test('every baseline entry names a lesson and a rule', () => {
    const ids = new Set(rows.map((row) => row.lesson.id));
    for (const entry of baseline) {
      const [id, rule] = entry.split(':') as [string, Rule];
      expect(ids.has(id) && ['reading', 'check', 'vocabulary', 'order', 'glossary'].includes(rule)).toBe(true);
    }
  });
});
