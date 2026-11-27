/**
 * The scan behind the test "no wait of a journey bypasses the factor" (run-journeys.test.ts): the waits of the journeys are
 * written as plain numbers and scale in one place, journeyTiming.ts. A line that bypasses it is returned as `file:line: text`.
 * Mark a measurement that must not scale with `// journey-time: <why>` on its line, or on the line before or after it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dir;
const RAW_LINE = [/Bun\.sleep\(\s*(?!100\))[\d_]+/, /setTimeout\(\s*\w+,\s*[\d_]+/, /Date\.now\(\)\s*\+\s*[\d_]+/, /<=?\s*[\d_]{5,}\s*\)/];
const RAW_WAIT_FOR = /import\s*\{[^}]*\bwaitFor\b[^}]*\}\s*from\s*'[./]*run-desktop-smoke'/s;

export function bypassingWaits(): string[] {
  const files = [
    'journeyApp.ts',
    'journeys.ts',
    'journeys013.ts',
    ...['journeys', 'journeys013'].flatMap((dir) => readdirSync(join(here, dir)).map((file) => join(dir, file))),
  ].filter((file) => file.endsWith('.ts'));
  const found: string[] = [];
  for (const file of files) {
    const text = readFileSync(join(here, file), 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const marked = lines.slice(Math.max(0, index - 1), index + 2).some((near) => near.includes('journey-time:'));
      if (!marked && RAW_LINE.some((pattern) => pattern.test(line))) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
    if (RAW_WAIT_FOR.test(text)) found.push(`${file}: imports waitFor from run-desktop-smoke; use journeyTiming`);
    for (const match of text.matchAll(/const until[^\n]*=>\s*\{\n[^\n]*\n/g))
      if (!match[0].includes('scaleWait(')) found.push(`${file}: an until() that does not scale its bound`);
  }
  return found;
}
