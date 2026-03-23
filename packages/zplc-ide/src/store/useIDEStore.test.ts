import { describe, expect, it } from 'bun:test';

import { DEFAULT_DEBUG_POLLING_INTERVAL_MS } from './debugDefaults';

describe('useIDEStore debug defaults', () => {
  it('uses a responsive live polling interval by default', () => {
    expect(DEFAULT_DEBUG_POLLING_INTERVAL_MS).toBe(100);
  });
});
