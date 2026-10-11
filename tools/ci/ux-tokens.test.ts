import { describe, expect, it } from 'bun:test';

import { contrastProblems, tokenProblems, undefinedTokens } from './ux-tokens';

describe('design token checks (UX-003, UX-024, UX-032)', () => {
  const known = new Set(['--text-primary', '--color-surface-800']);

  it('reports a var() that names no token', () => {
    const file = { path: 'src/A.tsx', text: 'const a = "text-[var(--text-primary)] bg-[var(--color-primary)]";\n' };
    expect(undefinedTokens(file, known)).toEqual(['UX-003: src/A.tsx:1 uses var(--color-primary), which no design token defines']);
  });

  it('accepts a custom property the same file declares, a fallback form and a framework variable', () => {
    const file = { path: 'src/B.tsx', text: "const style = { '--row-count': n };\nconst c = 'var(--row-count) var(--tw-ring-color) var(--text-primary, #000)';\n.x { --local: 1px; width: var(--local); }" };
    expect(undefinedTokens(file, known)).toEqual([]);
  });

  it('does not take an attribute selector that quotes a prefix for a use', () => {
    expect(undefinedTokens({ path: 'src/c.css', text: '[class*="bg-[var(--color-accent-"] { color: var(--text-primary); }' }, known)).toEqual([]);
  });

  it('finds no declared contrast pair below WCAG 2.2 AA in any theme', () => {
    expect(contrastProblems()).toEqual([]);
  });

  it('finds this repository current: the generated stylesheet, DESIGN.md and every token used (UX-003, UX-032)', () => {
    expect(tokenProblems()).toEqual([]);
  });
});
