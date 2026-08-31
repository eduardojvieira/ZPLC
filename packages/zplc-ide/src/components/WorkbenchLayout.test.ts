import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

describe('Workbench lower-ledger layout', () => {
  it('keeps auxiliary navigation inside the resizable lower panel', () => {
    const app = readFileSync(join(import.meta.dir, '..', 'App.tsx'), 'utf8');
    const store = readFileSync(join(import.meta.dir, '..', 'store', 'useIDEStore.ts'), 'utf8');

    expect(store).not.toContain('activeWorkbenchDrawer');
    expect(store).not.toContain('toggleWorkbenchDrawer');
    expect(store).not.toContain('closeWorkbenchDrawer');
    expect(app).not.toContain('id="sidebar"');
    expect(app).not.toContain('id="inspector"');
    expect(app).not.toContain('ActivityRail');
    expect(app).not.toContain('WorkbenchDrawer');
    expect(app).toContain('<Console');
  });
});
