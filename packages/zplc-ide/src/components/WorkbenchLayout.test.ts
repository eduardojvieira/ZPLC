import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

describe('Workbench lower-ledger layout', () => {
  it('UX-011 lays the workbench out as a rail, a primary sidebar, the editor over the results panel, and a secondary sidebar', () => {
    const app = readFileSync(join(import.meta.dir, '..', 'App.tsx'), 'utf8');
    const shell = readFileSync(join(import.meta.dir, '..', 'shell', 'WorkbenchShell.tsx'), 'utf8');
    const store = readFileSync(join(import.meta.dir, '..', 'store', 'useIDEStore.ts'), 'utf8');

    expect(store).not.toContain('activeWorkbenchDrawer');
    expect(store).not.toContain('toggleWorkbenchDrawer');
    expect(store).not.toContain('closeWorkbenchDrawer');
    expect(app).not.toContain('WorkbenchDrawer');
    expect(app).toContain('<WorkbenchShell');
    for (const region of ['<ActivityRail', 'id="primary"', 'id="center"', 'id="editor"', 'id="console"', 'id="secondary"', '<Console'])
      expect(shell).toContain(region);
  });
});
