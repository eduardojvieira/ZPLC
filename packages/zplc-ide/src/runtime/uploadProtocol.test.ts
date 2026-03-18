import { describe, expect, it } from 'bun:test';

import { getUploadCommandSet } from './uploadProtocol';

describe('getUploadCommandSet', () => {
  it('uses scheduler upload commands when the board advertises scheduler support', () => {
    expect(getUploadCommandSet(true)).toEqual({
      load: 'zplc sched load',
      data: 'zplc sched data',
      start: null,
    });
  });

  it('uses legacy upload commands when scheduler support is disabled', () => {
    expect(getUploadCommandSet(false)).toEqual({
      load: 'zplc load',
      data: 'zplc data',
      start: 'zplc start',
    });
  });
});
