// VF-008: the end-to-end suite has a journey for every flow that the requirement lists, and CI runs the suite on every pull request.
import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..', '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');
const names = [...read('packages/zplc-ide/scripts/journeys.ts').matchAll(/^\s+name: '([^']+)', example:/gm)].map((match) => match[1]!);

/** The flows of the requirement, each with the journey of the suite that drives it. */
const FLOWS: Array<[string, string]> = [
  ['create a project', '2b Create a new project'],
  ['open an existing folder', '1 Open an existing folder'],
  ['edit Structured Text', '3 Edit Structured Text, save, reopen'],
  ['build with an error and reach it from Problems', '4 Build with an error, reach it from Problems'],
  ['build successfully', '5 Build successfully'],
  ['simulate', '6 Simulate: connect, run, watch a value change'],
  ['watch a value', '8c The Watch table completes, sorts, and writes a prepared value'],
  ['hit a breakpoint', '7 Breakpoint stops execution'],
  ['force and release an input', '8 Force an input and release it'],
  ['save', '3b Save with Ctrl+S in the editor'],
  ['undo after switching tabs', '9 Undo after switching tabs'],
  ['close with unsaved changes', '10 Close with unsaved changes'],
  ['restore the session', '12 Restore the session'],
  ['start Learn with no project open and pass the first lesson', '11 Learn with no project open'],
];

describe('the end-to-end suite and the journeys of the requirement (VF-008)', () => {
  it.each(FLOWS)('has a journey for: %s', (_flow, journey) => {
    expect(names).toContain(journey);
  });

  it('runs on every pull request on Linux, under a virtual display', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/xvfb-run --auto-servernum bun run --cwd packages\/zplc-ide smoke:journeys/);
  });
});
