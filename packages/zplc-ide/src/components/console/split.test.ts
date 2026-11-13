import { describe, expect, it } from 'bun:test';
import { AgentTab } from './AgentTab';
import { ChangesTab } from './ChangesTab';
import { InterlocksTab } from './InterlocksTab';
import { TestsTab } from './TestsTab';
import { useWorkspaceTestRunner } from './useWorkspaceTestRunner';

describe('the Console panels are modules of their own', () => {
  it('IDE-014 the Tests, Interlocks, Changes and Agent panels are modules of their own', () => {
    expect(typeof TestsTab).toBe('function');
    expect(typeof InterlocksTab).toBe('function');
    expect(typeof ChangesTab).toBe('function');
    expect(typeof AgentTab).toBe('function');
    expect(typeof useWorkspaceTestRunner).toBe('function');
  });
});
