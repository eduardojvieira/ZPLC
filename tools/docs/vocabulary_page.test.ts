// The vocabulary table of the IDE docs (MSG-001) must carry every concept of VOCABULARY, in both languages.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { VOCABULARY } from '../../packages/zplc-ide/src/i18n/vocabulary';

const EN = 'docs/docs/ide/features.md';
const ES = 'docs/i18n/es/docusaurus-plugin-content-docs/current/ide/features.md';

/** The cells of every table row of a page, trimmed. */
function rows(path: string): string[][] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()));
}

describe('the interface vocabulary table', () => {
  const en = rows(EN);
  const es = rows(ES);
  for (const [id, row] of Object.entries(VOCABULARY)) {
    test(`${id}: "${row.en}" / "${row.es}" is a row of both pages`, () => {
      const enRow = en.find((cells) => cells[1] === row.en);
      expect(enRow).toBeDefined();
      for (const word of row.replaces) expect(enRow![3]).toContain(word);
      expect(es.some((cells) => cells[1] === row.en && cells[2] === row.es)).toBe(true);
    });
  }
});
