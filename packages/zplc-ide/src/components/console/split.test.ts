import { describe, expect, it } from 'bun:test';
import { stubMonaco, stubProjectLoader } from '../../test/dom';

// The panels reach the store, whose example loader only exists under Vite, and the Monaco diff view. Both are stubbed before the
// first import: a file that fails while it loads leaves its half-loaded modules in Bun's one module registry, and a later file
// that imports the store then reads a binding that never initialised ("Cannot access 'useIDEStore' before initialization").
await stubProjectLoader();
await stubMonaco();
const { AgentTab } = await import('./AgentTab');
const { ChangesTab } = await import('./ChangesTab');
const { InterlocksTab } = await import('./InterlocksTab');
const { TestsTab } = await import('./TestsTab');
const { useWorkspaceTestRunner } = await import('./useWorkspaceTestRunner');

describe('the Console panels are modules of their own', () => {
  it('IDE-014 the Tests, Interlocks, Changes and Agent panels are modules of their own', () => {
    expect(typeof TestsTab).toBe('function');
    expect(typeof InterlocksTab).toBe('function');
    expect(typeof ChangesTab).toBe('function');
    expect(typeof AgentTab).toBe('function');
    expect(typeof useWorkspaceTestRunner).toBe('function');
  });
});
