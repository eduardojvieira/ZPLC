import { describe, expect, it } from 'bun:test';

import { isInlineLivePreviewEnabled } from './codeEditorLivePreview';

describe('isInlineLivePreviewEnabled', () => {
  it('disables inline preview when debug mode is none', () => {
    expect(isInlineLivePreviewEnabled('none', false)).toBe(false);
    expect(isInlineLivePreviewEnabled('none', true)).toBe(false);
  });

  it('always enables inline preview in simulation mode', () => {
    expect(isInlineLivePreviewEnabled('simulation', false)).toBe(true);
    expect(isInlineLivePreviewEnabled('simulation', true)).toBe(true);
  });

  it('requires the live button in hardware mode', () => {
    expect(isInlineLivePreviewEnabled('hardware', false)).toBe(false);
    expect(isInlineLivePreviewEnabled('hardware', true)).toBe(true);
  });
});
