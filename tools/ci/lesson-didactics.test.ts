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
  RULES,
  statementsAdded,
  unexplainedConstructs,
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
const page = (example: string, mistakes: string) =>
  `## ${example}\n\n![A figure](images/a.png)\n\n## ${mistakes}\n\n\`\`\`quiz\nquestion: Q\n\`\`\`\n`;
const PAGES = { en: page('Worked example', 'Common mistakes'), es: page('Ejemplo resuelto', 'Errores comunes') };
const lesson = (id: string, patch: Partial<LessonFacts> = {}): LessonFacts => ({
  id,
  module: 1,
  languages: ['ST'],
  minutes: 10,
  reading: { en: true, es: true },
  readingText: { en: '', es: '' },
  readingSource: PAGES,
  addedLines: ['A := 1;', 'B := 2;'],
  addedStatements: [],
  starterSource: '',
  starter: { statements: 0, graphic: false },
  machine: null,
  hasWrongSet: true,
  text: { en: text(), es: text({}, 'Pulse Comprobar.') },
  ...patch,
});
const base = (lessons: LessonFacts[], patch: Partial<Input> = {}): Input => ({
  lessons,
  checkLabel: { en: 'Check', es: 'Comprobar' },
  ideas: { ideas: {}, practises: {} },
  terms: [],
  paths: [],
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

  test('glossary: a forbidden word right before a {{ui:}} placeholder names a Studio control, not the concept', () => {
    const terms = [{ concept: 'push button', en: 'push button', es: 'pulsador', forbidden: { en: [], es: ['botón'] } }];
    const es = (body: string) => ({ text: { en: text(), es: text({ summary: body }, 'Pulse Comprobar.') } });
    expect(offending(base([lesson('a', es('Pulse el botón {{ui:learn.check}}.'))], { terms }))).toEqual([]);
    expect(offending(base([lesson('a', es('Pulse el botón de marcha.'))], { terms }))).toEqual(['a:glossary']);
    expect(offending(base([lesson('a', es('El botón de marcha y el botón {{ui:learn.check}}.'))], { terms }))).toEqual(['a:glossary']);
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

  test('reading-parts: a page lacks a figure or timing diagram, a quiz, or the two headings, in its own language', () => {
    expect(offending(base([lesson('a')]))).toEqual([]);
    const noParts = { en: '## Worked example\n\nText.\n', es: PAGES.es };
    const input = base([lesson('a', { readingSource: noParts })]);
    expect(offending(input)).toEqual(['a:reading-parts']);
    expect(evaluate(input)[0]!.offences['reading-parts']).toBe('no figure (en), no quiz (en), no "Common mistakes" (en)');
    // A timing, ld-figure or ld-try block is a figure; the English heading on the Spanish page is not the Spanish heading.
    const timing = PAGES.en.replace('![A figure](images/a.png)', '```timing\nspan: 10\n```');
    expect(offending(base([lesson('a', { readingSource: { en: timing, es: PAGES.es } })]))).toEqual([]);
    expect(offending(base([lesson('a', { readingSource: { en: PAGES.en, es: PAGES.en } })]))).toEqual(['a:reading-parts']);
    // A level-3 heading is not the heading; a lesson without a page is the rule `reading`, not this one.
    expect(offending(base([lesson('a', { readingSource: { en: PAGES.en.replace('## Worked', '### Worked'), es: PAGES.es } })]))).toEqual([
      'a:reading-parts',
    ]);
    expect(offending(base([lesson('a', { reading: { en: false, es: false }, readingSource: { en: '', es: '' } })]))).toEqual(['a:reading']);
  });

  test('answer: a code line the solution adds, spaces normalised, in a field other than the last hint', () => {
    const added = { addedLines: ['Q := A AND B;'] };
    const en = (patch: Partial<LessonText>) => ({ ...added, text: { en: text(patch), es: text({}, 'Pulse Comprobar.') } });
    expect(
      offending(
        base([
          lesson(
            'a',
            en({
              hints: [
                { level: 1, text: 'Write `Q:=A  AND B ;`.' },
                { level: 2, text: 'H' },
              ],
            }),
          ),
        ]),
      ),
    ).toEqual(['a:answer']);
    expect(offending(base([lesson('a', en({ objectives: ['Q := A AND B;'] }))]))).toEqual(['a:answer']);
    // Code is matched case-sensitively: the operator words count only in their code form.
    expect(offending(base([lesson('a', en({ faultCases: ['q := a and b;'] }))]))).toEqual([]);
    expect(offending(base([lesson('a', en({ faultCases: ['Q := A AND B;'] }))]))).toEqual(['a:answer']);
    const il = (objective: string) => ({
      addedLines: ['ADD 5'],
      text: { en: text({ objectives: [objective] }), es: text({}, 'Pulse Comprobar.') },
    });
    expect(offending(base([lesson('a', il('Then add 5 to Total.'))]))).toEqual([]);
    expect(offending(base([lesson('a', il('Then ADD 5 to it.'))]))).toEqual(['a:answer']);
    // A Reflect stage is read before the pass by a learner who reads ahead: it is checked like any stage.
    const reflect = { key: 'reflect', title: 'Reflect', body: 'You wrote Q := A AND B; there.', checkpoint: 'ok' };
    expect(
      offending(
        base([
          lesson('a', { ...added, text: { en: { ...text(), stages: [...text().stages, reflect] }, es: text({}, 'Pulse Comprobar.') } }),
        ]),
      ),
    ).toEqual(['a:answer']);
    // Code inside {{v:…|X}} or around {{t:N}} is read as the learner sees it.
    expect(offending(base([lesson('a', en({ objectives: ['Write {{v:Q=true@30|Q := A AND B;}} now.'] }))]))).toEqual(['a:answer']);
    const timed = { addedLines: ['CAL HoldTimer(IN := Button, PT := T#300ms)'] };
    expect(
      offending(
        base([
          lesson('a', {
            ...timed,
            text: { en: text({ objectives: ['CAL HoldTimer(IN := Button, PT := T#{{t:300}}ms)'] }), es: text({}, 'Pulse Comprobar.') },
          }),
        ]),
      ),
    ).toEqual(['a:answer']);
    expect(evaluate(base([lesson('a', en({ objectives: ['Q := A AND B;'] }))]))[0]!.offences.answer).toBe('Q:=A AND B; (en)');
    // The last hint may hold the answer; a longer name around the line is not the line; LD, FBD and SFC are not checked.
    expect(
      offending(
        base([
          lesson(
            'a',
            en({
              hints: [
                { level: 1, text: 'H' },
                { level: 2, text: 'Q := A AND B;' },
              ],
            }),
          ),
        ]),
      ),
    ).toEqual([]);
    expect(offending(base([lesson('a', en({ objectives: ['XQ := A AND B;C'] }))]))).toEqual([]);
    expect(offending(base([lesson('a', en({ objectives: ['Q := A AND B; then stop.'] }))]))).toEqual(['a:answer']);
    // A line of one word is the frame of a statement, not its answer.
    expect(
      offending(
        base([
          lesson('a', {
            addedLines: ['VAR', 'END_IF;'],
            text: { en: text({ objectives: ['A VAR and END_IF;'] }), es: text({}, 'Pulse Comprobar.') },
          }),
        ]),
      ),
    ).toEqual([]);
    expect(offending(base([lesson('a', { ...en({ objectives: ['Q := A AND B;'] }), addedLines: null })]))).toEqual([]);
  });

  test('answer: a solution statement or a right-hand side of more than 6 characters, printed alone, is a leak too', () => {
    const facts = (objective: string, starterSource = '') => ({
      addedLines: [],
      addedStatements: ['Level := (Raw * 100) / 1000', 'Ok := A + B', 'Run := A OR B', 'Go := A OR Bc'],
      starterSource,
      text: { en: text({ objectives: [objective] }), es: text({}, 'Pulse Comprobar.') },
    });
    // 6 normalised characters (A OR B) is not a candidate, 7 (A OR Bc) is.
    expect(offending(base([lesson('a', facts('Press A OR B.'))]))).toEqual([]);
    expect(offending(base([lesson('a', facts('Press A OR Bc.'))]))).toEqual(['a:answer']);
    // A candidate the starter already holds gives nothing away.
    expect(offending(base([lesson('a', facts('Compute (Raw*100) / 1000.', 'Shown := (Raw * 100) / 1000;'))]))).toEqual([]);
    expect(offending(base([lesson('a', facts('Compute (Raw*100) / 1000 and store it.'))]))).toEqual(['a:answer']);
    expect(evaluate(base([lesson('a', facts('Compute (Raw*100) / 1000.'))]))[0]!.offences.answer).toBe('(Raw*100)/1000 (en)');
    expect(offending(base([lesson('a', facts('Write Level:=(Raw*100)/1000 here.'))]))).toEqual(['a:answer']);
    // A right-hand side shorter than 6 characters once normalised (A+B) is not the answer alone.
    expect(offending(base([lesson('a', facts('Use A + B.'))]))).toEqual([]);
  });

  test('statementsAdded: the ST statements of the solution that the starter lacks, declarations left out', () => {
    const starter = 'PROGRAM P\nVAR X : INT; END_VAR\nX := 1;\nEND_PROGRAM\n';
    const solution = [
      'PROGRAM P',
      'VAR X : INT; Y : INT; END_VAR',
      'X := 1;',
      '(* scale *)',
      'Y := (X * 100) / 1000;',
      'IF X > 0 THEN Y := 0; END_IF;',
      'END_PROGRAM',
    ].join('\n');
    expect(statementsAdded(starter, solution)).toEqual(['Y := (X * 100) / 1000', 'IF X > 0 THEN Y := 0', 'END_IF']);
  });

  test('grows: the last lesson of each module of a path starts from its declarations', () => {
    const paths = [{ id: 'p', lessons: ['a', 'b', 'c'] }];
    const run = (b: number, c: number, cGraphic = true) =>
      offending(
        base(
          [
            lesson('a', { starter: { statements: 5, graphic: false } }),
            lesson('b', { starter: { statements: b, graphic: false } }),
            lesson('c', { module: 2, languages: ['LD'], starter: { statements: c, graphic: cGraphic } }),
            lesson('d', { starter: { statements: 9, graphic: false } }),
          ],
          { paths },
        ),
      );
    // a is not last in module 1 of the path, d is in no path.
    expect(run(2, 0)).toEqual([]);
    expect(run(3, 0)).toEqual(['b:grows']);
    expect(run(2, 1)).toEqual(['c:grows']);
    expect(run(2, 1, false)).toEqual([]);
    const rows = evaluate(base([lesson('a', { starter: { statements: 3, graphic: false } })], { paths: [{ id: 'p', lessons: ['a'] }] }));
    expect(rows[0]!.offences.grows).toBe('3 starter statements, last of module 1 in p');
  });

  test('scope: a checkpoint names the simulator, the real machine, a board or safety, in its language', () => {
    const at = (en: string, es: string) => ({
      text: {
        en: { ...text(), stages: [{ key: 'run', title: 'Run', body: 'Press Check.', checkpoint: en }] },
        es: { ...text({}, 'Pulse Comprobar.'), stages: [{ key: 'run', title: 'R', body: 'Pulse Comprobar.', checkpoint: es }] },
      },
    });
    expect(offending(base([lesson('a', at('It passes in the Simulator.', 'ok'))]))).toEqual(['a:scope']);
    expect(offending(base([lesson('a', at('ok', 'No en la máquina real.'))]))).toEqual(['a:scope']);
    expect(offending(base([lesson('a', at('ok', 'Sin placa de desarrollo.'))]))).toEqual(['a:scope']);
    // "placa" alone is also the plate of a pusher.
    expect(offending(base([lesson('a', at('ok', 'La placa del empujador avanza.'))]))).toEqual([]);
    // verify-my-board is about the board itself: the board term is exempt there, the other terms are not.
    expect(offending(base([lesson('verify-my-board', at('The board blinks.', 'La placa de desarrollo parpadea.'))]))).toEqual([]);
    expect(offending(base([lesson('verify-my-board', at('For safety.', 'ok'))]))).toEqual(['verify-my-board:scope']);
    expect(offending(base([lesson('a', at('For safety.', 'ok'))]))).toEqual(['a:scope']);
    // The scope may say it; another language's word is not checked; a checkpoint without the words holds.
    expect(
      offending(base([lesson('a', { text: { en: text({ scope: 'On the simulator only.' }), es: text({}, 'Pulse Comprobar.') } })])),
    ).toEqual([]);
    expect(offending(base([lesson('a', at('placa', 'board'))]))).toEqual([]);
  });

  test('machine: the reading page of a lesson that names a scene embeds its image and its table, cell by cell', () => {
    const table = {
      en: '| Part | Kind |\n| --- | --- |\n| `Belt1` | Belt conveyor |\n',
      es: '| Elemento | Tipo |\n| --- | --- |\n| `Belt1` | Cinta |\n',
    };
    const machine = {
      en: { image: 'images/machine.en.png', table: table.en },
      es: { image: 'images/machine.es.png', table: table.es },
    };
    const pageWith = (lang: 'en' | 'es', image: string, rows: string) => `${PAGES[lang]}\n![The machine](${image})\n\n${rows}\nProse.\n`;
    const padded = { en: '| Part      | Kind          |\n| --------- | ------------- |\n| `Belt1`   | Belt conveyor |\n', es: table.es };
    const good = { en: pageWith('en', 'images/machine.en.png', padded.en), es: pageWith('es', 'images/machine.es.png', table.es) };
    expect(offending(base([lesson('a', { machine, readingSource: good })]))).toEqual([]);
    const stale = { ...good, es: pageWith('es', 'images/machine.es.png', table.es.replace('Cinta', 'Banda')) };
    expect(offending(base([lesson('a', { machine, readingSource: stale })]))).toEqual(['a:machine']);
    const noImage = { ...good, en: pageWith('en', 'images/other.png', padded.en) };
    const row = evaluate(base([lesson('a', { machine, readingSource: noImage })]))[0]!;
    expect(row.offences.machine).toBe('no image (en)');
    expect(evaluate(base([lesson('a', { machine, readingSource: stale })]))[0]!.offences.machine).toBe('no table (es)');
    // No scene, or no reading page (the rule `reading` counts that), and nothing is asked.
    expect(offending(base([lesson('a', { readingSource: good })]))).toEqual([]);
    expect(offending(base([lesson('a', { machine, reading: { en: false, es: false } })]))).toEqual(['a:reading']);
  });

  test('constructs: a construct the matrix marks "Teach" in some language needs an idea in lesson-ideas.json, named after it', () => {
    const matrix = [
      '| Construct | ST | LD |',
      '| --- | --- | --- |',
      '| TP | Teach | Teach |',
      '| User FUNCTION | Teach | Gap (1) |',
      '| SHL, SHR | Gap (2) | — |',
      '',
    ].join('\n');
    const ideas = { ideas: { tp: { explainedBy: 'x' } }, practises: {} };
    expect(unexplainedConstructs(matrix, ideas)).toEqual(['user-function:explainer']);
    expect(unexplainedConstructs(matrix, { ideas: {}, practises: {} })).toEqual(['tp:explainer', 'user-function:explainer']);
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
  test('the table shows the starter statements of each lesson', () => {
    const shown = renderTable(evaluate(base([lesson('a', { starter: { statements: 4, graphic: false } })])));
    expect(shown).toContain('| Starter statements |');
    expect(shown).toMatch(/\| `a` \| 1 \| ST \| 10 \| yes \| 2 \| 4 \|/);
  });
  test('a stale table fails', () => expect(check(rows, ['a:reading'], table + 'x', [])).toEqual([expect.stringContaining('is stale')]));
  test('a construct without an explainer is in the ratchet too', () => {
    const withConstruct = renderTable(rows, ['tp:explainer']);
    expect(check(rows, ['a:reading'], withConstruct, [], ['tp:explainer'])).toEqual([expect.stringContaining('new offence tp:explainer')]);
    expect(check(rows, ['a:reading', 'tp:explainer'], withConstruct, [], ['tp:explainer'])).toEqual([]);
    expect(check(rows, ['a:reading', 'tp:explainer'], table, [], [])).toEqual([expect.stringContaining('tp:explainer no longer occurs')]);
  });
});

describe('the real tree', () => {
  const { input, glossary, problems, matrix } = loadInput();
  const rows = evaluate(input);
  const constructs = unexplainedConstructs(matrix, input.ideas);
  const baseline = (JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) as { offences: string[] }).offences;

  test('the packages and both mappings are sound', () => expect([...problems, ...mappingProblems(input, glossary)]).toEqual([]));
  test('it holds against the baseline and the committed table', () =>
    expect(check(rows, baseline, existsSync(TABLE_FILE) ? readFileSync(TABLE_FILE, 'utf8') : undefined, [], constructs)).toEqual([]));
  test('the three pilot lessons keep the rules of T1', () => {
    for (const id of ['timers-on-delay-off-delay', 'sfc-fill-mix-sequence', 'plant-belt-to-sensor']) {
      const row = rows.find((candidate) => candidate.lesson.id === id)!;
      const t1 = (['reading-parts', 'answer', 'grows', 'scope', 'machine'] as const).filter((rule) => row.offences[rule] !== undefined);
      expect({ id, t1 }).toEqual({ id, t1: [] });
    }
  });
  test('the matrix is read: it names at least the fifteen constructs of L7', () =>
    expect(unexplainedConstructs(matrix, { ideas: {}, practises: {} }).length).toBeGreaterThanOrEqual(15));
  test('the pilot plant lesson embeds its scene, so the rule has a table to compare', () =>
    expect(rows.find((row) => row.lesson.id === 'plant-belt-to-sensor')!.lesson.machine?.en.table).toContain('`Belt1`'));
  test('every baseline entry names a lesson and a rule', () => {
    const ids = new Set(rows.map((row) => row.lesson.id));
    const known = new Set(unexplainedConstructs(matrix, { ideas: {}, practises: {} }));
    for (const entry of baseline) {
      const [id, rule] = entry.split(':') as [string, Rule | 'explainer'];
      expect({ entry, ok: rule === 'explainer' ? known.has(entry) : ids.has(id) && RULES.includes(rule) }).toEqual({ entry, ok: true });
    }
  });
});
