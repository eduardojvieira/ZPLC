import { describe, expect, it } from 'bun:test';

import { checkCatalogs, checkRepository, checkSources, isGuarded, midSentenceCapitals, ratchetOffenders, violationsOf, type Offender, type Rule } from './i18n-guard';

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
  const entry = (count: number): Offender => ({ file: at('Old'), rule: 'hard-coded-text', count, requirement: 'UX-029', added: '2026-10-17', reason: 'fixture' });
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
    const problems = checkCatalogs({ 'a.one': 'One {count}', 'a.two': 'Two', 'a.three': 'Three {name}' }, { 'a.one': 'Uno {count}', 'a.three': 'Tres {nombre}', 'a.four': 'Cuatro' });
    expect(problems.join('\n')).toContain('"a.two" is in the English catalog and not in the Spanish one (missing-key)');
    expect(problems.join('\n')).toContain('"a.four" is in the Spanish catalog and not in the English one (extra-key)');
    expect(problems.join('\n')).toContain('"a.three" has other {placeholders} in Spanish than in English (placeholder-mismatch)');
    expect(problems).toHaveLength(3);
  });

  it('UX-031 fails on text that is not in sentence case, and passes acronyms, names, quoted labels and code tokens', () => {
    const rejected = checkCatalogs({ 'a.title': 'Open Project Folder' }, { 'a.title': 'Abrir carpeta' });
    expect(rejected.join('\n')).toContain('not in sentence case: "Project", "Folder" (sentence-case)');
    expect(checkCatalogs({ 'a.name': 'Open the project' }, { 'a.name': 'Abrir Proyecto' }).join('\n')).toContain('Spanish "a.name" is not in sentence case');
    const accepted = { 'a.quoted': 'Choose "Refresh" and press "Enter"', 'a.one': 'Use the ZPLC Studio USB driver for I/O. Then restart', 'a.two': 'Edit zplc.json in the Learn tab: Open it', 'a.three': '{count} spaces' };
    expect(checkCatalogs(accepted, accepted)).toEqual([]);
    expect(midSentenceCapitals('Open Project')).toEqual(['Project']);
  });

  it('UX-031 fails on an exclamation mark and on an internal term, in either language', () => {
    expect(checkCatalogs({ 'a.hey': 'Saved!', 'a.cand': 'This candidate was built', 'a.link': 'Use Link zplc.json', 'a.stop': 'A stopgap' }, { 'a.hey': 'Guardado', 'a.cand': 'Listo', 'a.link': 'Listo', 'a.stop': 'Listo' }).join('\n'))
      .toMatch(/English "a.hey" has an exclamation mark[\s\S]*English "a.cand" uses the internal term "candidate"[\s\S]*English "a.link" uses the internal term "link zplc.json"[\s\S]*English "a.stop" uses the internal term "stopgap"/);
    expect(checkCatalogs({ 'a.hey': 'Saved' }, { 'a.hey': '¡Guardado!' }).join('\n')).toContain('Spanish "a.hey" has an exclamation mark');
  });

  it('UX-029 stays quiet on a correct pair of catalogs', () => {
    expect(checkCatalogs({ 'a.b.one': '{count} file', 'a.b.other': '{count} files' }, { 'a.b.one': '{count} archivo', 'a.b.other': '{count} archivos' })).toEqual([]);
  });
});
