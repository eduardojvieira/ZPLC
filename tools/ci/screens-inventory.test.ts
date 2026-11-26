// UXV-001: `screens.md` lists every surface of Studio. Every surface of `surfaces.ts` and every view of `views.ts` has its row, a row
// that claims a registry names an id that registry has, every file a row names exists, and every command it names is registered.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { COMMAND_LIST } from '../../packages/zplc-ide/src/commands/registry';
import { SURFACES } from '../../packages/zplc-ide/src/shell/surfaces';

const ROOT = resolve(import.meta.dir, '../..');
const INVENTORY = 'specs/014-zplc-2-1-release-quality/screens.md';
// views.ts imports React components; its surface ids are read from the text so the test loads no UI.
const VIEWS_SOURCE = readFileSync(resolve(ROOT, 'packages/zplc-ide/src/shell/views.ts'), 'utf8');
const VIEW_SURFACES = [...VIEWS_SOURCE.matchAll(/surface: '([^']+)'/g)].map((match) => match[1]);

interface Row {
  id: string;
  registry: string;
  where: string[];
  states: string;
  reached: string[];
}

const ticks = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);

/** The rows of the inventory tables: the ones whose first cell is a backticked id, under the header `| Id | Surface | Registry |`. */
function rows(text: string): Row[] {
  return text
    .split('\n')
    .filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line))
    .map((line) => {
      const cells = line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        id: ticks(cells[0])[0],
        registry: cells[2] ?? '',
        where: ticks(cells[3] ?? ''),
        states: cells[4] ?? '',
        reached: ticks(cells[5] ?? ''),
      };
    });
}

describe('UXV-001 the inventory of the surfaces of Studio', () => {
  const text = existsSync(resolve(ROOT, INVENTORY)) ? readFileSync(resolve(ROOT, INVENTORY), 'utf8') : '';
  const inventory = rows(text);
  const ids = inventory.map((row) => row.id);
  const commands = new Set(COMMAND_LIST.map((command) => command.id));

  it('exists and has rows', () => {
    expect(inventory.length).toBeGreaterThan(0);
  });

  it('gives every surface of surfaces.ts and every view of views.ts its row, marked with its registry', () => {
    expect(VIEW_SURFACES.length).toBeGreaterThan(0);
    const missing = [
      ...SURFACES.filter((s) => !inventory.some((row) => row.id === s.id && row.registry.includes('surfaces.ts'))).map(
        (s) => `surfaces.ts ${s.id}`,
      ),
      ...VIEW_SURFACES.filter((id) => !inventory.some((row) => row.id === id && row.registry.includes('views.ts'))).map(
        (id) => `views.ts ${id}`,
      ),
    ];
    expect(missing).toEqual([]);
  });

  it('names no registered surface that its registry does not have', () => {
    const invented = inventory.filter(
      (row) =>
        (row.registry.includes('surfaces.ts') && !SURFACES.some((s) => s.id === row.id)) ||
        (row.registry.includes('views.ts') && !VIEW_SURFACES.includes(row.id)),
    );
    expect(invented.map((row) => row.id)).toEqual([]);
  });

  it('has one row per id, each with its states', () => {
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
    expect(inventory.filter((row) => row.states.length === 0).map((row) => row.id)).toEqual([]);
  });

  it('names only files that exist and commands that are registered', () => {
    const gone = inventory.flatMap((row) =>
      row.where.filter((path) => !existsSync(resolve(ROOT, path))).map((path) => `${row.id}: ${path}`),
    );
    const unknown = inventory.flatMap((row) => row.reached.filter((id) => !commands.has(id)).map((id) => `${row.id}: ${id}`));
    expect(gone).toEqual([]);
    expect(unknown).toEqual([]);
  });
});
