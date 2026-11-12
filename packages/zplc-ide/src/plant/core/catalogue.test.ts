import { describe, expect, it } from 'bun:test';
import type { PartDefinition } from '../contracts';
import { catalogue, createCatalogue, registerParts } from './catalogue';

const def = (id: string): PartDefinition => ({
  id,
  family: 'items',
  names: { en: id, es: id },
  config: {},
  signals: () => [],
  actions: [],
  snapPoints: () => [],
  doc: { en: '', es: '' },
});

describe('catalogue', () => {
  it('PRT-002 a part is defined once: a duplicate id is rejected', () => {
    expect(() => createCatalogue([def('belt'), def('belt')])).toThrow('duplicate part definition "belt"');
  });

  it('PRT-002 definitions are listed in registration order and found by id', () => {
    const cat = createCatalogue([def('b'), def('a')]);
    expect(cat.list().map((d) => d.id)).toEqual(['b', 'a']);
    expect(cat.get('a')?.id).toBe('a');
    expect(cat.get('zzz')).toBeUndefined();
  });

  it('PRT-010 registerParts adds to the shipped catalogue and refuses a repeat', () => {
    registerParts([def('p1-test-part')]);
    expect(catalogue.get('p1-test-part')?.id).toBe('p1-test-part');
    expect(() => registerParts([def('p1-test-part')])).toThrow('duplicate part definition');
    expect(catalogue.list().filter((d) => d.id === 'p1-test-part')).toHaveLength(1);
  });
});
