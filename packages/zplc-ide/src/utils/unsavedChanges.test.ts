import { describe, expect, it } from 'bun:test';
import { unsavedItems, unsavedOutcome, type UnsavedChoice } from './unsavedChanges';

describe('unsaved changes decision', () => {
  const table: Array<[UnsavedChoice, boolean, 'proceed' | 'stay']> = [
    ['save', false, 'proceed'],
    ['save', true, 'stay'],
    ['discard', false, 'proceed'],
    ['discard', true, 'proceed'],
    ['cancel', false, 'stay'],
    ['cancel', true, 'stay'],
  ];

  for (const [choice, stillModified, outcome] of table) {
    it(`${choice} with ${stillModified ? 'files still modified' : 'nothing left modified'} will ${outcome}`, () => {
      expect(unsavedOutcome(choice, stillModified)).toBe(outcome);
    });
  }
});

describe('unsaved items', () => {
  const file = (name: string, isModified: boolean) => ({ name, isModified });

  it('lists only modified files, in order', () => {
    expect(unsavedItems([file('Motor.st', true), file('Pump.st', false), file('main.ld.json', true)], false)).toEqual([
      'Motor.st',
      'main.ld.json',
    ]);
  });

  it('adds the project configuration when it is modified', () => {
    expect(unsavedItems([file('Motor.st', false)], true)).toEqual(['Project settings (zplc.json)']);
    expect(unsavedItems([], false)).toEqual([]);
  });
});
