import { describe, expect, it } from 'bun:test';

import { knownDiskContent, planExternalChanges, type OpenFileInfo } from './externalChanges';

const file = (path: string, content: string, isModified: boolean, diskContent?: string | null): OpenFileInfo => ({ path, content, isModified, diskContent });

describe('what a change made outside Studio does to an open file (IDE-004)', () => {
  it('reloads an unmodified file whose content on disk changed, without asking', () => {
    const plan = planExternalChanges([file('src/A.st', 'old', false, 'old')], new Map([['src/A.st', 'new']]));
    expect(plan).toEqual({ reload: [{ path: 'src/A.st', content: 'new' }], conflicts: [], close: [] });
  });

  it('asks about a modified file whose content on disk changed, offering the text that is on disk', () => {
    const plan = planExternalChanges([file('src/A.st', 'mine', true, 'old')], new Map([['src/A.st', 'theirs']]));
    expect(plan).toEqual({ reload: [], conflicts: [{ path: 'src/A.st', disk: 'theirs' }], close: [] });
  });

  it('leaves a file alone when the disk holds what Studio last read or wrote, so its own save is not a change', () => {
    const own = planExternalChanges([file('src/A.st', 'typed after the save', true, 'saved')], new Map([['src/A.st', 'saved']]));
    expect(own).toEqual({ reload: [], conflicts: [], close: [] });
    const same = planExternalChanges([file('src/A.st', 'same', false, 'same')], new Map([['src/A.st', 'same']]));
    expect(same).toEqual({ reload: [], conflicts: [], close: [] });
  });

  it('closes an unmodified file that was deleted, and asks about a modified one', () => {
    const plan = planExternalChanges([file('src/A.st', 'a', false, 'a'), file('src/B.st', 'mine', true, 'b')], new Map([['src/A.st', null], ['src/B.st', null]]));
    expect(plan).toEqual({ reload: [], conflicts: [{ path: 'src/B.st', disk: null }], close: ['src/A.st'] });
  });

  it('does nothing about a file it could not read now, and about files nobody asked it to check', () => {
    const plan = planExternalChanges([file('src/A.st', 'a', false, 'a'), file('src/B.st', 'b', true, 'b')], new Map([['src/A.st', undefined]]));
    expect(plan).toEqual({ reload: [], conflicts: [], close: [] });
  });

  it('does not ask again about a deletion the user already answered by keeping their version', () => {
    expect(planExternalChanges([file('src/A.st', 'mine', true, null)], new Map([['src/A.st', null]]))).toEqual({ reload: [], conflicts: [], close: [] });
    expect(planExternalChanges([file('src/A.st', 'mine', true, null)], new Map([['src/A.st', 'recreated']])).conflicts).toEqual([{ path: 'src/A.st', disk: 'recreated' }]);
  });

  it('does not ask about a modified file whose last known disk content it never had, unless the disk differs from the buffer', () => {
    expect(knownDiskContent(file('src/A.st', 'text', false))).toBe('text');
    expect(knownDiskContent(file('src/A.st', 'text', true))).toBeUndefined();
    expect(planExternalChanges([file('src/A.st', 'mine', true)], new Map([['src/A.st', 'mine']]))).toEqual({ reload: [], conflicts: [], close: [] });
    expect(planExternalChanges([file('src/A.st', 'mine', true)], new Map([['src/A.st', 'theirs']])).conflicts).toEqual([{ path: 'src/A.st', disk: 'theirs' }]);
  });
});
