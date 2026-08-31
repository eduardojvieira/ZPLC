import { describe, expect, it } from 'bun:test';
import { canCommitVisualEditorChange } from '../editors/visualCommitGuard';

describe('visual editor commit guard', () => {
  const ld = { id: 'ladder-a', language: 'LD' as const };

  it('accepts only the active editor identity and language', () => {
    expect(canCommitVisualEditorChange(7, 7, 'ladder-a', 'ladder-a', 'LD', ld)).toBe(true);
    expect(canCommitVisualEditorChange(8, 7, 'ladder-a', 'ladder-a', 'LD', ld)).toBe(false);
    expect(canCommitVisualEditorChange(7, 7, 'ladder-b', 'ladder-a', 'LD', ld)).toBe(false);
    expect(canCommitVisualEditorChange(7, 7, 'ladder-a', 'ladder-a', 'FBD', ld)).toBe(false);
    expect(canCommitVisualEditorChange(7, 7, 'ladder-a', 'ladder-a', 'LD', undefined)).toBe(false);
  });
});
