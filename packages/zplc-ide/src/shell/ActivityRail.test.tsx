import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { COMMANDS } from '../commands/registry';
import { auditMarkup } from '../ui/audit';
import { ActivityRail } from './ActivityRail';

const render = (active: 'project' | 'search' | 'tests' | 'learn', density: 'regular' | 'compact') =>
  renderToStaticMarkup(<ActivityRail active={active} density={density} onSelect={() => undefined} />);

describe('activity rail (UX-011)', () => {
  it('UX-011 offers Project, Search, Tests and Learn as named buttons, in that order', () => {
    const out = render('project', 'regular');
    const names = [...out.matchAll(/<button[^>]*aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(names).toEqual(['Project', 'Search', 'Tests', 'Learn']);
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-011 marks the selected activity with aria-current and a data mark that the stylesheet draws as a bar, not by colour alone', () => {
    const out = render('search', 'regular');
    expect(out.match(/aria-current="true"/g)?.length).toBe(1);
    expect(out).toMatch(/<button[^>]*aria-current="true"[^>]*data-activity="search"|<button[^>]*data-activity="search"[^>]*aria-current="true"/);
    expect(out).toContain('data-active="true"');
  });

  it('UX-023 shows the labels in the regular shell and only the icons in the compact one', () => {
    expect(render('project', 'regular')).toContain('activity-rail-label');
    expect(render('project', 'compact')).not.toContain('activity-rail-label');
    expect(render('project', 'compact')).toContain('data-density="compact"');
  });

  it('UX-011 gives the sidebars and the panel a shortcut each, with no shortcut used twice', () => {
    const shortcuts = COMMANDS.flatMap((command) => ('shortcut' in command ? [command.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const id of ['view.togglePrimarySidebar', 'view.toggleSecondarySidebar', 'view.toggleConsole']) {
      expect(COMMANDS.find((command) => command.id === id && 'shortcut' in command)).toBeDefined();
    }
  });
});
