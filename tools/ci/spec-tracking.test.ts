// DOC-025: once spec 011 is tracked (decision D-09), spec 010 points to it and no older spec folder is left looking
// open: each one is completed, archived, superseded, or says that spec 011 continues it.
import { describe, expect, it } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const SPECS = join(ROOT, 'specs');
const CURRENT = '011-zplc-2-0-remediation';

const statusOf = (text: string) => /^\*\*Status\*\*:\s*([^\n]*?)\s*$/m.exec(text)?.[1] ?? '';

describe('spec folders (DOC-025)', () => {
  it('tracks spec 011 with its plan and research', () => {
    for (const file of ['spec.md', 'plan.md', 'research.md']) expect([file, existsSync(join(SPECS, CURRENT, file))]).toEqual([file, true]);
  });

  it('gives spec 010 a note that points to spec 011', () => {
    expect(readFileSync(join(SPECS, '010-zplc-2-0-foundation', 'spec.md'), 'utf8')).toContain(`../${CURRENT}/spec.md`);
  });

  it('leaves no older spec looking open: each is completed, archived, superseded, or continued by spec 011', () => {
    const open = readdirSync(SPECS)
      .filter((folder) => folder !== CURRENT && existsSync(join(SPECS, folder, 'spec.md')))
      .filter((folder) => {
        const text = readFileSync(join(SPECS, folder, 'spec.md'), 'utf8');
        return !/^(Completed|Archived|Superseded)\b/.test(statusOf(text)) && !text.includes(`../${CURRENT}/spec.md`);
      });
    expect(open).toEqual([]);
  });
});
