import { describe, expect, it } from 'bun:test';

import {
  checkCatalogs,
  checkRepository,
  checkSources,
  isGuarded,
  isGuardedModule,
  midSentenceCapitals,
  ratchetOffenders,
  violationsOf,
  type Offender,
  type Rule,
} from './i18n-guard';

// The sources below are fixtures held as strings, not product sources (VF-006).
const at = (name: string): string => `packages/zplc-ide/src/components/${name}.tsx`;
const rulesOf = (text: string, path = at('Sample')): Rule[] => violationsOf({ path, text }).map((violation) => violation.rule);

describe('UX-029 i18n guard: a hard-coded string in a component', () => {
  it('UX-029 finds JSX text with letters, a literal shown as a child and a template shown as a child', () => {
    expect(rulesOf('const A = () => <p>Save the project</p>')).toEqual(['hard-coded-text']);
    expect(rulesOf("const A = ({ ok }) => <p>{ok ? 'Saved' : 'Not saved'}</p>")).toEqual(['hard-coded-text']);
    expect(rulesOf('const A = ({ n }) => <p>{`Opened ${n} files`}</p>')).toEqual(['hard-coded-text']);
    expect(rulesOf("const A = () => <p>{'Done'}</p>")).toEqual(['hard-coded-text']);
  });

  it('UX-029 finds a string literal in each user-visible attribute', () => {
    const attributes = ['aria-label', 'placeholder', 'alt', 'label', 'tooltip', 'title', 'description'];
    for (const name of attributes) expect(rulesOf(`const A = () => <X ${name}="Close the dialog" />`)).toEqual(['hard-coded-attribute']);
    expect(rulesOf("const A = ({ on }) => <X label={on ? 'Stop' : 'Run'} />")).toEqual(['hard-coded-attribute']);
    expect(rulesOf('const A = ({ n }) => <X aria-label={`Remove ${n}`} />')).toEqual(['hard-coded-attribute']);
  });

  it('UX-029 stays quiet on a component that writes its text through t()', () => {
    const correct = `
      import { useT } from '../i18n';
      export function Correct({ count, ok }: { count: number; ok: boolean }) {
        const { t, tn } = useT();
        return (
          <section role="status" aria-label={t('status.label')} data-kind="primary" className="flex gap-2 text-sm">
            <h1>{t('status.heading')}</h1>
            <p>{ok ? t('status.ok') : t('status.failed')}</p>
            <span>{tn('status.files', count)}</span>
            <span>{count}</span>
            <X label={t('status.run')} placeholder={undefined} type="button" />
            <span>&nbsp;·&nbsp;</span>
            <code>zplc.json</code>
            <kbd>Ctrl</kbd>
          </section>
        );
      }`;
    expect(violationsOf({ path: at('Correct'), text: correct })).toEqual([]);
  });

  it('UX-029 guards components only: not tests, the i18n module, the gallery or plain modules', () => {
    expect(isGuarded('packages/zplc-ide/src/components/A.tsx')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/ui/Dialog.tsx')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/components/A.test.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/i18n/index.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/ui/gallery/Specimens.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/components/presentation.ts')).toBe(false);
  });
});

describe('UX-029 i18n guard: the list of offenders only shrinks', () => {
  const entry = (count: number): Offender => ({
    file: at('Old'),
    rule: 'hard-coded-text',
    count,
    requirement: 'UX-029',
    added: '2026-10-17',
    reason: 'fixture',
  });
  const old = (strings: number) => ({ path: at('Old'), text: `const A = () => <div>${'<p>Text</p>'.repeat(strings)}</div>` });

  it('UX-029 fails for a file that is not listed, a count that grew, a count that shrank and an entry that reached zero', () => {
    expect(checkSources([old(2)], { offenders: [entry(2)] })).toEqual([]);
    expect(checkSources([old(2)], { offenders: [] }).join('\n')).toContain('has 2 hard-coded-text strings');
    expect(checkSources([old(3)], { offenders: [entry(2)] }).join('\n')).toContain('grew from 2 to 3');
    expect(checkSources([old(1)], { offenders: [entry(2)] }).join('\n')).toContain('now has 1 hard-coded-text strings, recorded 2');
    expect(checkSources([old(0)], { offenders: [entry(2)] }).join('\n')).toContain('has no hard-coded-text string any more');
  });

  it('UX-029 --write lowers counts and drops entries, and never raises a count', () => {
    expect(ratchetOffenders([old(1)], [entry(2)]).map((item) => item.count)).toEqual([1]);
    expect(ratchetOffenders([old(0)], [entry(2)])).toEqual([]);
    expect(ratchetOffenders([old(5)], [entry(2)]).map((item) => item.count)).toEqual([2]);
  });

  it('UX-029 holds on the repository: the sources and both catalogs pass with the list as it is', () => {
    expect(checkRepository()).toEqual([]);
  });
});

describe('UX-029 i18n guard: the catalogs as data', () => {
  it('UX-029 fails on a key in English and not in Spanish, a key only in Spanish, and different placeholders', () => {
    const problems = checkCatalogs(
      { 'a.one': 'One {count}', 'a.two': 'Two', 'a.three': 'Three {name}' },
      { 'a.one': 'Uno {count}', 'a.three': 'Tres {nombre}', 'a.four': 'Cuatro' },
    );
    expect(problems.join('\n')).toContain('"a.two" is in the English catalog and not in the Spanish one (missing-key)');
    expect(problems.join('\n')).toContain('"a.four" is in the Spanish catalog and not in the English one (extra-key)');
    expect(problems.join('\n')).toContain('"a.three" has other {placeholders} in Spanish than in English (placeholder-mismatch)');
    expect(problems).toHaveLength(3);
  });

  it('UX-031 fails on text that is not in sentence case, and passes acronyms, names, quoted labels and code tokens', () => {
    const rejected = checkCatalogs({ 'a.title': 'Open Project Folder' }, { 'a.title': 'Abrir carpeta' });
    expect(rejected.join('\n')).toContain('not in sentence case: "Project", "Folder" (sentence-case)');
    expect(checkCatalogs({ 'a.name': 'Open the project' }, { 'a.name': 'Abrir Proyecto' }).join('\n')).toContain(
      'Spanish "a.name" is not in sentence case',
    );
    const accepted = {
      'a.quoted': 'Choose "Refresh" and press "Enter"',
      'a.one': 'Use the ZPLC Studio USB driver for I/O. Then restart',
      'a.two': 'Edit zplc.json in the Learn tab: Open it',
      'a.three': '{count} spaces',
    };
    expect(checkCatalogs(accepted, accepted)).toEqual([]);
    expect(midSentenceCapitals('Open Project')).toEqual(['Project']);
  });

  it('UX-031 fails on an exclamation mark and on an internal term, in either language', () => {
    expect(
      checkCatalogs(
        { 'a.hey': 'Saved!', 'a.cand': 'This candidate was built', 'a.link': 'Use Link zplc.json', 'a.stop': 'A stopgap' },
        { 'a.hey': 'Guardado', 'a.cand': 'Listo', 'a.link': 'Listo', 'a.stop': 'Listo' },
      ).join('\n'),
    ).toMatch(
      new RegExp(
        String.raw`English "a.hey" has an exclamation mark[\s\S]*English "a.cand" uses the internal term "can` +
          String.raw`didate"[\s\S]*English "a.link" uses the internal term "link zplc.json"[\s\S]*English "a.st` +
          String.raw`op" uses the internal term "stopgap"`,
      ),
    );
    expect(checkCatalogs({ 'a.hey': 'Saved' }, { 'a.hey': '¡Guardado!' }).join('\n')).toContain('Spanish "a.hey" has an exclamation mark');
  });

  it('UX-030 fails on voseo in the Spanish text (decision D-10: neutral, impersonal or "usted"), and passes the neutral forms', () => {
    const voseo = checkCatalogs(
      { 'a.open': 'Open the folder', 'a.you': 'You can choose', 'a.save': 'Save before checking' },
      { 'a.open': 'Abrí la carpeta', 'a.you': 'Vos podés elegir', 'a.save': 'Guardá antes de verificar' },
    );
    expect(voseo.filter((problem) => problem.includes('(voseo)'))).toHaveLength(3);
    const neutral = {
      'a.open': 'Abra la carpeta',
      'a.you': 'Puede elegir',
      'a.save': 'Guarde antes de comprobar',
      'a.status': 'La carpeta está lista, así que puede continuar',
    };
    expect(
      checkCatalogs(
        {
          'a.open': 'Open the folder',
          'a.you': 'You can choose',
          'a.save': 'Save before checking',
          'a.status': 'The folder is ready, so you can continue',
        },
        neutral,
      ),
    ).toEqual([]);
  });

  it('UX-031 fails on an exclamation mark in English text, and on a question that opens with an inverted mark in Spanish', () => {
    expect(checkCatalogs({ 'a.done': 'Compile first!' }, { 'a.done': 'Compile primero' }).join('\n')).toContain('(exclamation)');
    expect(checkCatalogs({ 'a.ask': 'Delete it?' }, { 'a.ask': '¡Eliminar!' }).join('\n')).toContain(
      'Spanish "a.ask" has an exclamation mark',
    );
  });

  it('UX-029 stays quiet on a correct pair of catalogs', () => {
    expect(
      checkCatalogs(
        { 'a.b.one': '{count} file', 'a.b.other': '{count} files' },
        { 'a.b.one': '{count} archivo', 'a.b.other': '{count} archivos' },
      ),
    ).toEqual([]);
  });
});

describe('UX-029 i18n guard: a hard-coded message in a plain module', () => {
  const module = (name: string): string => `packages/zplc-ide/src/editors/${name}.ts`;
  const found = (text: string, path = module('keyboard')): string[] =>
    violationsOf({ path, text }).map((violation) => `${violation.rule}:${violation.snippet}`);

  it('UX-029 counts a message that a formatter cut in two as one message (VF-017)', () => {
    expect(found("const a = { message: 'Program deployed ' + 'and stopped.' };")).toHaveLength(1);
    expect(found('const a = { message: `Deleted ${n} ` + `elements of the diagram.` };')).toHaveLength(1);
    expect(found("const a = { message: 'a' + 'b' };")).toHaveLength(0);
  });

  it('UX-029 finds a sentence in say, title, label, detail and message, and the first argument of announce()', () => {
    expect(found('export const a = (n: number) => ({ say: `Deleted ${n} elements.` });')).toEqual([
      'hard-coded-message:`Deleted ${n} elements.`',
    ]);
    expect(found("const a = { title: 'Variable the coil writes' };")).toEqual(["hard-coded-message:'Variable the coil writes'"]);
    expect(found("const a = { label: ok ? 'Wires' : 'No wires', detail: 'Output of the block' };")).toHaveLength(3);
    expect(found("log({ type: 'info', message: 'Program deployed and stopped.', source: 'runtime' });")).toHaveLength(1);
    expect(found("announce('Element palette: type to search.');")).toHaveLength(1);
  });

  it('UX-029 stays quiet on text that goes through t(), identifiers, state words, upper-case tokens and other properties', () => {
    expect(found("const a = { say: t('ld.say.deleted', { n }), title: t('ld.title.coil') };")).toEqual([]);
    expect(found("const a = { group: 'first-steps', kind: 'Wires', type: 'info', label: 'TRUE', id: 'palette' };")).toEqual([]);
    expect(found("console.log('Opening the port'); throw new Error('Internal failure of the parser');")).toEqual([]);
  });

  it('UX-029 finds the text a Label, Problem or Message function returns and the values of a LABELS table', () => {
    expect(
      found(
        "export const kindLabel = (kind: string): string => LABEL[kind]; const KIND_LABEL = { PROGRAM: 'Program', STRUCT: 'Structure' };",
      ),
    ).toHaveLength(2);
    expect(
      found(
        "export function libraryProblem(p: string): string | null { if (p === '') return 'The project root cannot be a library.'; return " +
          "p ? null : 'No project is open.'; }",
      ),
    ).toHaveLength(2);
    expect(found("export const stateText = (on: boolean) => (on ? 'Connected now' : 'Not connected');")).toHaveLength(2);
    expect(found("const context = 'Some text here'; function render() { return 'Plain words here'; }")).toEqual([]);
    expect(found('export const kindLabel = (kind: string): string => t(`kind.${kind}`);')).toEqual([]);
  });

  it('UX-029 reads the modules that show text and leaves tests, the i18n module and the tools of programs alone', () => {
    expect(isGuardedModule(module('keyboard'))).toBe(true);
    expect(isGuardedModule('packages/zplc-ide/src/components/deployFlow.ts')).toBe(true);
    for (const path of [
      'packages/zplc-ide/src/editors/keyboard.test.ts',
      'packages/zplc-ide/src/i18n/catalog/ld.ts',
      'packages/zplc-ide/src/mcp/server.ts',
      'packages/zplc-ide/src/cli/toolApi.ts',
      'packages/zplc-ide/src/compiler/index.ts',
      'packages/zplc-ide/src/components/A.tsx',
    ]) {
      expect(isGuardedModule(path)).toBe(false);
    }
  });

  it('UX-029 counts a message of a plain module against the list of offenders', () => {
    const file = { path: module('keyboard'), text: "const a = { say: 'Removed the wire.' };" };
    expect(checkSources([file], { offenders: [] })[0]).toContain('hard-coded-message');
    expect(
      checkSources([file], {
        offenders: [
          { file: file.path, rule: 'hard-coded-message', count: 1, requirement: 'UX-029', added: '2026-10-19', reason: 'fixture' },
        ],
      }),
    ).toEqual([]);
  });
});
