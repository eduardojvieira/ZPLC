import { describe, expect, it } from 'bun:test';

import { markdownProse, scanRepository, scanText, unreleasedSection } from './product-name';

// UX-030, DOC-017, REL-031: the product is ZPLC (decision D-03); no surface a person reads names it otherwise.
describe('UX-030 DOC-017 REL-031 product name guard: the scanner', () => {
  it('finds the retired names and nothing else', () => {
    expect(scanText('a', 'Open ZPLC Studio now').map((o) => o.term)).toEqual(['ZPLC Studio']);
    expect(scanText('a', 'The ZPLC IDE saves').map((o) => o.term)).toEqual(['ZPLC IDE']);
    expect(scanText('a', 'Studio saves your work').map((o) => o.term)).toEqual(['Studio']);
    expect(scanText('a', 'Open ZPLC. Visual Studio Code is not this product.')).toHaveLength(1);
    expect(scanText('a', 'Open the project in ZPLC and run the studio-vertical smoke')).toEqual([]);
  });

  it('honours an allow-list entry only for its own surface and excerpt', () => {
    const allowed = [{ surface: 'x.md', excerpt: 'Studio saves', reason: 'history' }];
    expect(scanText('x.md', 'Studio saves', allowed)).toEqual([]);
    expect(scanText('y.md', 'Studio saves', allowed)).toHaveLength(1);
  });

  it('reads prose only: code spans and fenced blocks are literal identifiers', () => {
    expect(scanText('a', markdownProse('Run `smoke:studio` and `Studio`.\n\n```\nStudio\n```\n'))).toEqual([]);
    expect(unreleasedSection('# C\n\n## Unreleased\n\nStudio\n\n## 2.0.0-rc.3\n\nold Studio\n')).not.toContain('old');
  });
});

describe('UX-030 DOC-017 REL-031 product name guard: the repository', () => {
  it('UX-030 DOC-017 REL-031 names the product ZPLC in every catalog, page, config label and release text', () => {
    const offenders = scanRepository().map((o) => `${o.surface}: [${o.term}] ${o.excerpt}`);
    expect(offenders).toEqual([]);
  });
});
