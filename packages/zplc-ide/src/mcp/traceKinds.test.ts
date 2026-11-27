import { describe, expect } from 'bun:test';
import { fileURLToPath } from 'node:url';

import { itNative } from '../cli/nativeRuntimeGuard';
import { createMcpDispatcher, openMcpWorkspace } from './server';

const BLINKY = fileURLToPath(new URL('../../projects/blinky_st/', import.meta.url));

describe('MCP trace of a run with RISING and FALLING assertions', () => {
  itNative('IDE-031 trace_get returns the RISING and FALLING assertions of a recorded run', async () => {
    const workspace = await openMcpWorkspace(BLINKY);
    const dispatch = createMcpDispatcher(workspace!);
    const result = await dispatch('trace_get', { scenarioId: 'BlinkyST', mode: 'full' }, new AbortController().signal);
    expect(result.isError).toBeUndefined();
    const content = result.structuredContent as { assertions: Array<{ kind: string }>; traceSha256: string };
    expect(content.traceSha256).toMatch(/^[0-9a-f]{64}$/);
    const kinds = new Set(content.assertions.map(({ kind }) => kind));
    expect(kinds.has('RISING') && kinds.has('FALLING')).toBe(true);
  });
});
