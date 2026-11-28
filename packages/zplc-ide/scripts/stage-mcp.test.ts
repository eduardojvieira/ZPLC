import { afterEach, expect, it } from 'bun:test';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { stageMcp } from './stage-mcp';

const made: string[] = [];
const folder = () => made[made.push(mkdtempSync(join(tmpdir(), 'zplc-stage-mcp-'))) - 1] as string;
afterEach(() => made.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })));

it('stages the executable of the release under the name the application looks for', () => {
  const from = folder();
  writeFileSync(join(from, 'zplc-cli-2.1.0-win-x64.exe'), 'cli');
  writeFileSync(join(from, 'zplc-mcp-2.1.0-win-x64.exe'), 'mcp');
  const to = folder();
  expect(stageMcp(from, to)).toBe(join(to, 'zplc-mcp.exe'));
  expect(readdirSync(to)).toEqual(['zplc-mcp.exe']);
  writeFileSync(join(from, 'zplc-mcp-2.1.0-linux-x64'), 'mcp');
  expect(() => stageMcp(from, to)).toThrow('found 2');
});
