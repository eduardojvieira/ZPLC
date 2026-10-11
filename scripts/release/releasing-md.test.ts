// REL-029, REL-035: RELEASING.md is the one checklist, and it lists every external service the release uses with a
// cost of none.
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..', '..');
const releasing = readFileSync(join(root, 'RELEASING.md'), 'utf8');

/** The rows of the Markdown table that follows `heading`, as arrays of cells. */
function tableAfter(heading: string): string[][] {
  const lines = releasing.split('\n');
  const start = lines.findIndex((line) => line === heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rows: string[][] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ') && rows.length > 0) break;
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    rows.push(cells);
  }
  return rows.slice(1); // the header row
}

describe('the checklist of a release (REL-029)', () => {
  test('goes through version bump, green CI, rehearsal, tag, draft, manual checks, publish and the channels, in that order', () => {
    const order = [
      '### 1. Choose and bump the version',
      '### 2. Check locally and wait for green CI',
      '### 3. Rehearse',
      '### 4. Tag',
      '### 5. Read the draft',
      '### 6. Manual checks',
      '### 7. Publish',
      '### 8. Channels that follow a published release',
    ];
    const positions = order.map((heading) => releasing.indexOf(`\n${heading}\n`));
    expect(positions.every((position) => position > 0), order.join(', ')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  test('names the tap, the AUR, the Store and winget updates', () => {
    const channels = tableAfter('### 8. Channels that follow a published release').map((row) => row[0]);
    expect(channels).toEqual(['Homebrew tap', 'Arch User Repository', 'Microsoft Store', 'winget']);
  });

  test('names every script that it tells a person to run, and each exists', () => {
    for (const script of releasing.match(/scripts\/release[A-Za-z0-9_./-]*\.(?:ts|mjs)/g) ?? []) {
      expect(readdirSync(join(root, script, '..')), script).toContain(script.split('/').at(-1)!);
    }
  });
});

describe('the external services of the release (REL-035)', () => {
  const services = tableAfter('## External services and their cost');

  test('every service costs nothing', () => {
    expect(services.length).toBeGreaterThanOrEqual(10);
    for (const [service, , , cost] of services) expect(cost!.toLowerCase(), service).toMatch(/^none/);
  });

  test('names the registries and hosts that the jobs fetch from', () => {
    const text = services.map((row) => row.join(' ')).join('\n').toLowerCase();
    for (const service of ['github actions', 'bun runtime', 'npm registry', 'docker hub', 'python package index', 'github pages', 'sigstore']) {
      expect(text, service).toContain(service);
    }
  });

  test('says that a service that costs money needs an owner decision', () => {
    expect(releasing).toContain('without a decision of the owner');
  });
});
