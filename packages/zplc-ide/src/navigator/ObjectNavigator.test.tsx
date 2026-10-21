import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditMarkup } from '../ui/audit';
import { buildNavigatorGroups } from './navigatorGroups';
import { navigatorWords } from './navigatorWords';
import { translatorFor } from '../i18n';

// The navigator reaches the store, which imports the bundled-example loader that only exists under Vite (import.meta.glob).
await mock.module('../utils/projectLoader', () => ({
  getAvailableProjects: () => [],
  loadProject: () => null,
  loadProjectAssets: () => null,
}));
const { ObjectNavigatorView } = await import('./ObjectNavigator');

const words = navigatorWords(translatorFor('en'));
const groups = buildNavigatorGroups(
  {
    declarations: [{ file: 'src/Main.st', declarations: [{ name: 'Main', kind: 'PROGRAM', file: 'src/Main.st', line: 3, column: 9 }] }],
    globals: [],
    fileTree: null,
    config: null,
  },
  words,
);

describe('object navigator view (UX-012)', () => {
  it('UX-012 shows the nine groups as expandable sections, with the program under Programs', () => {
    const out = renderToStaticMarkup(
      <ObjectNavigatorView groups={groups} collapsed={new Set()} onToggle={() => undefined} onOpen={() => undefined} />,
    );
    for (const title of [
      'Programs',
      'Function blocks',
      'Functions',
      'Data types',
      'Global variables',
      'Tasks',
      'I/O mapping',
      'Communication',
      'Device',
    ])
      expect(out).toContain(`>${title}</span>`);
    expect(out.match(/aria-expanded="true"/g)?.length).toBe(9);
    expect(out).toContain('>Main</span>');
    expect(out).toContain('aria-label="Project navigator"');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-012 hides the items of a collapsed group and says so for the others that are empty', () => {
    const out = renderToStaticMarkup(
      <ObjectNavigatorView groups={groups} collapsed={new Set(['programs'])} onToggle={() => undefined} onOpen={() => undefined} />,
    );
    expect(out).not.toContain('>Main</span>');
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Nothing here yet');
  });
});
