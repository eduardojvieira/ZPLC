import { describe, expect, it } from 'bun:test';

import type { MatrixRow } from '../ci/generate-conformance-matrix';
import type { CaseFacts } from '../ci/conformance-coverage';
import { RUNNER } from '../ci/conformance-coverage';
import { MEMORY_REGION } from '../../packages/zplc-compiler/src/contract.generated.ts';
import { LANGUAGES, addressingTable, inputErrors, languageBody, loadInputs, onPage, plainTitle, rowFacts, titleCell } from './generate_language_reference';

const row = (id: string, target: MatrixRow['target']): MatrixRow => ({ id, area: 'statements', section: '6.5', title: id, status: 'missing', statusText: '', target, targetText: '', requirements: ['CMP-001'], cases: [], tags: [] });
const found = (name: string, matrix: string[], build: 'succeeds' | 'fails' = 'succeeds'): CaseFacts => ({ id: `cmp/${name}`, name, build, matrix, tags: [] });
const listed = (name: string) => `${RUNNER} > conformance > ${name}`;

describe('language reference: the state of an element comes from the executed cases (DOC-006, stopgap: no editor screenshot yet)', () => {
  it('is "works" only when a passing case names the row and none of its cases is a known failure', () => {
    expect(rowFacts(row('a.b', 'works'), [found('CMP-001 x', ['a.b'])], [], [])).toMatchObject({ state: 'works', passing: 1, failing: 0 });
  });

  it('is "partial" when some cases pass and some are on the list, and "broken" when none passes', () => {
    const cases = [found('CMP-001 pass', ['a.b']), found('CMP-001 fail', ['a.b'])];
    expect(rowFacts(row('a.b', 'works'), cases, [listed('CMP-001 fail')], [])).toMatchObject({ state: 'partial', passing: 1, failing: 1 });
    expect(rowFacts(row('a.b', 'works'), [found('CMP-001 fail', ['a.b'])], [listed('CMP-001 fail')], [])).toMatchObject({ state: 'broken', passing: 0, failing: 1 });
  });

  it('is "unverified" when no case names the row, however the spec table once described it', () => {
    const optimistic = { ...row('a.b', 'works'), status: 'works' as const };
    expect(rowFacts(optimistic, [found('CMP-001 other', ['c.d'])], [], [])).toMatchObject({ state: 'unverified', passing: 0 });
  });

  it('is "rejected" only with a negative case, and a case that must build does not prove a rejection', () => {
    expect(rowFacts(row('a.b', 'rejects'), [found('CMP-003 refused', ['a.b'], 'fails')], [], [])).toMatchObject({ state: 'rejected', passing: 1 });
    expect(rowFacts(row('a.b', 'decision'), [found('CMP-003 refused', ['a.b'], 'fails')], [], [])).toMatchObject({ state: 'decision' });
    expect(rowFacts(row('a.b', 'rejects'), [found('CMP-003 builds', ['a.b'], 'succeeds')], [], [])).toMatchObject({ state: 'unverified', passing: 0 });
  });
});

describe('language reference: every row of the matrix is on a page, in both languages (DOC-006, stopgap: no editor screenshot yet)', () => {
  const inputs = loadInputs();

  it('puts every row of conformance/matrix.json on at least one language page and gives it a Spanish title', () => {
    expect(inputErrors(inputs)).toEqual([]);
    for (const { row: entry } of inputs.facts) expect([entry.id, LANGUAGES.filter((language) => onPage(language, entry)).length > 0]).toEqual([entry.id, true]);
  });

  it('lists each row of a page in its table and in the not-supported list when it does not work', () => {
    for (const language of LANGUAGES) {
      const text = languageBody(language, inputs, 'en');
      for (const fact of inputs.facts.filter(({ row: entry }) => onPage(language, entry))) {
        const title = titleCell(plainTitle(fact.row.title));
        expect([language, fact.row.id, text.includes(`| ${title} |`)]).toEqual([language, fact.row.id, true]);
        const occurrences = text.split(`| ${title} |`).length - 1;
        expect([fact.row.id, occurrences]).toEqual([fact.row.id, fact.state === 'works' ? 1 : 2]);
      }
    }
  });

  it('has the same headings in English and in Spanish and states what is not supported', () => {
    for (const language of LANGUAGES) {
      const levels = (text: string) => [...text.matchAll(/^(#{2,6}) /gm)].map((match) => match[1]!.length);
      expect(levels(languageBody(language, inputs, 'es'))).toEqual(levels(languageBody(language, inputs, 'en')));
      expect(languageBody(language, inputs, 'en')).toContain('## Not supported');
      expect(languageBody(language, inputs, 'es')).toContain('## No admitido');
    }
  });

  it('shows no image: a screenshot is published when automation has captured one', () => {
    for (const language of LANGUAGES) expect(languageBody(language, inputs, 'en')).not.toMatch(/!\[|<img|\.png|\.jpg|\.svg/);
  });
});

describe('language reference: markup and addressing (DOC-006, stopgap: no editor screenshot yet)', () => {
  it('escapes asterisks, angle brackets and underscores of an element title and drops file references', () => {
    expect(titleCell('**, &, bit access w.0')).toBe('\\*\\*, &, bit access w.0');
    expect(titleCell('Comments /* */')).toBe('Comments /\\* \\*/');
    expect(plainTitle('The 34 implemented operators (IDE/src/compiler/il/ilToST.ts:442-484, :399)')).toBe('The 34 implemented operators');
  });

  it('writes the regions of the addressing table from the contract', () => {
    const text = addressingTable('en');
    for (const region of [MEMORY_REGION.IPI, MEMORY_REGION.OPI, MEMORY_REGION.WORK]) expect(text).toContain(`0x${region.base.toString(16).toUpperCase().padStart(4, '0')}`);
    expect(text).toContain('`%IX<byte>.<bit>`');
    expect(text).toContain('`%QW<n>`');
  });
});
