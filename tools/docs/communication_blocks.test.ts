import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

// COM-007: the documentation states, for each of the twelve communication and cloud blocks, what it was verified
// against. A block that is missing from the table, listed twice, or claimed against a live service that no record
// of this repository shows, fails here.

const ROOT = new URL('../../', import.meta.url).pathname;
const BLOCKS = [
  'MB_READ_HREG',
  'MB_WRITE_HREG',
  'MB_READ_COIL',
  'MB_WRITE_COIL',
  'MQTT_CONNECT',
  'MQTT_PUBLISH',
  'MQTT_SUBSCRIBE',
  'AZURE_C2D_RECV',
  'AZURE_DPS_PROV',
  'AZURE_EG_PUB',
  'AWS_FLEET_PROV',
  'SPB_REBIRTH',
];
const PAGES = {
  en: { path: 'docs/docs/runtime/communication-function-blocks.md', heading: '## What each block was verified against', no: 'No' },
  es: {
    path: 'docs/i18n/es/docusaurus-plugin-content-docs/current/runtime/communication-function-blocks.md',
    heading: '## Contra qué se verificó cada bloque',
    no: 'No',
  },
} as const;

/** The rows of the first table under `heading`, as lists of cells. */
function table(text: string, heading: string): string[][] {
  const start = text.indexOf(heading);
  if (start < 0) return [];
  const lines = text.slice(start + heading.length).split('\n');
  const rows: string[][] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('|')) {
      inTable = true;
      rows.push(
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    } else if (inTable) {
      break;
    } else if (line.startsWith('## ')) {
      break;
    }
  }
  return rows.slice(2); // the header and the rule
}

describe('the communication blocks say what each was verified against (COM-007)', () => {
  for (const [language, page] of Object.entries(PAGES)) {
    it(`states it for each of the twelve blocks in the ${language} page`, () => {
      const rows = table(readFileSync(ROOT + page.path, 'utf8'), page.heading);
      expect(rows.length).toBeGreaterThan(0);
      for (const block of BLOCKS) {
        const named = rows.filter((row) => row[0]!.includes(`\`${block}\``));
        expect(named.length, `${block} appears in ${named.length} rows of the table`).toBe(1);
        const [, handler, double, live] = named[0]!;
        expect(handler!.length).toBeGreaterThan(0);
        expect(double!.length).toBeGreaterThan(0);
        // no record of a run against a live service exists in this repository
        expect(live, `${block}: the live service column`).toBe(page.no);
      }
    });
  }
});
