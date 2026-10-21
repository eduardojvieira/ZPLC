/**
 * The software review that closes the requirements needing a physical board (HIL-001, HIL-002, HIL-005, HIL-010,
 * HIL-012, HIL-014, HIL-015, LRN-013, LRN-024, RT-025, LNG-004, IO-006, COM-016, DOC-004; owner decision 2026-10-20):
 * every scenario has exactly one verdict, a verdict that cannot be judged in software names the silicon fact, and the
 * results section of both pages counts what verdicts.json holds.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '../..');
const REVIEW = join(ROOT, 'tools/hil/software-review');
const PAGES = {
  en: join(ROOT, 'docs/docs/development/hardware-software-review.md'),
  es: join(ROOT, 'docs/i18n/es/docusaurus-plugin-content-docs/current/development/hardware-software-review.md'),
};
const LABELS = {
  en: { should_pass: 'Should pass', should_not_pass: 'Should not pass', cannot_judge_in_software: 'Cannot be judged in software' },
  es: { should_pass: 'Debería pasar', should_not_pass: 'No debería pasar', cannot_judge_in_software: 'No se puede juzgar por software' },
};
const VERDICTS = ['should_pass', 'should_not_pass', 'cannot_judge_in_software'] as const;
type Verdict = (typeof VERDICTS)[number];
type Entry = {
  verdict: Verdict;
  judge: 'a' | 'b';
  reasoning: string;
  evidence_run: string;
  rejudged?: { date: string; verdict: Verdict; reasoning: string; evidence_run: string };
};

const scenarios = JSON.parse(readFileSync(join(REVIEW, 'scenarios.json'), 'utf8')) as {
  requirements: Array<{ id: string; scenarios: Array<{ id: string; silicon_only: string }> }>;
};
const all = scenarios.requirements.flatMap((requirement) => requirement.scenarios);
const verdicts = existsSync(join(REVIEW, 'verdicts.json'))
  ? (JSON.parse(readFileSync(join(REVIEW, 'verdicts.json'), 'utf8')) as Record<string, Entry>)
  : {};
/** The final verdict of an entry: the re-judged one when the scenario was judged again. */
const finalVerdict = (entry: Entry): Verdict => entry.rejudged?.verdict ?? entry.verdict;

describe('the software review of the hardware requirements (HIL-001, HIL-002, HIL-010, RT-025, COM-016, IO-006, DOC-004)', () => {
  test('every scenario has exactly one verdict, and no verdict names a scenario that does not exist', () => {
    expect(existsSync(join(REVIEW, 'verdicts-a.json')) || existsSync(join(REVIEW, 'verdicts-b.json'))).toBe(false);
    const ids = all.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(verdicts).sort()).toEqual([...ids].sort());
    for (const [id, entry] of Object.entries(verdicts)) {
      expect({ id, verdict: VERDICTS.includes(entry.verdict) }).toEqual({ id, verdict: true });
      expect({ id, judge: ['a', 'b'].includes(entry.judge) }).toEqual({ id, judge: true });
      expect({ id, reasoning: entry.reasoning.length > 0, run: entry.evidence_run.length > 0 }).toEqual({ id, reasoning: true, run: true });
      if (entry.rejudged) {
        expect({ id, date: entry.rejudged.date }).toEqual({ id, date: '2026-10-20' });
        expect({ id, verdict: VERDICTS.includes(entry.rejudged.verdict) }).toEqual({ id, verdict: true });
        expect({ id, run: entry.rejudged.evidence_run.length > 0 }).toEqual({ id, run: true });
      }
    }
  });

  test('every scenario that cannot be judged in software names the silicon fact that a person checks at a bench', () => {
    const cannot = all.filter((scenario) => finalVerdict(verdicts[scenario.id]) === 'cannot_judge_in_software');
    expect(cannot.length).toBeGreaterThan(0);
    for (const scenario of cannot) {
      // "nothing beyond the software" is the statement that a scenario has no silicon fact, so it cannot back this verdict
      expect({
        id: scenario.id,
        fact: scenario.silicon_only.length > 20 && !/^nothing beyond the software/.test(scenario.silicon_only),
      }).toEqual({ id: scenario.id, fact: true });
    }
  });

  for (const language of ['en', 'es'] as const) {
    test(
      `the ${language} page counts what verdicts.json holds, lists each scenario that cannot be judged and each that should not ` + `pass`,
      () => {
        const page = readFileSync(PAGES[language], 'utf8');
        const counts = (verdict: Verdict) => all.filter((scenario) => finalVerdict(verdicts[scenario.id]) === verdict).length;
        for (const verdict of VERDICTS) {
          const row = page.match(new RegExp(`^\\| ${LABELS[language][verdict]}\\s*\\| (\\d+)\\s*\\|$`, 'm'));
          expect({ language, verdict, count: row ? Number(row[1]) : null }).toEqual({ language, verdict, count: counts(verdict) });
        }
        for (const scenario of all) {
          const verdict = finalVerdict(verdicts[scenario.id]);
          if (verdict === 'should_pass') continue;
          expect({ id: scenario.id, listed: page.includes(`**${scenario.id}**`) }).toEqual({ id: scenario.id, listed: true });
        }
      },
    );
  }
});
