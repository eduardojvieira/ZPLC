import { describe, expect, it } from 'bun:test';

import { DRAG_MIME_TYPE, parseLDDropData } from './ldDragData';

function dataTransferWith(data: string): Pick<DataTransfer, 'getData'> {
  return {
    getData: (type: string) => type === DRAG_MIME_TYPE ? data : '',
  };
}

describe('parseLDDropData', () => {
  it('returns valid ladder toolbox data', () => {
    expect(parseLDDropData(dataTransferWith('{"type":"contact_no","category":"contact"}'))).toEqual({
      type: 'contact_no',
      category: 'contact',
    });
  });

  it('returns null when no ladder data is present', () => {
    expect(parseLDDropData(dataTransferWith(''))).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    expect(parseLDDropData(dataTransferWith('{invalid'))).toBeNull();
  });
});
