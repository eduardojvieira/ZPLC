import { describe, expect, it } from 'bun:test';

import { VOSEO_MARKERS } from '../../../../tools/ci/i18n-guard';
import { formatHash, formatSize, formatTime, VOCABULARY, type ConceptId } from './vocabulary';

const CONCEPTS: ConceptId[] = [
  'project',
  'simulation',
  'board',
  'target',
  'build',
  'deploy',
  'test',
  'check',
  'plant',
  'resultSimulation',
  'resultBoard',
];

describe('MSG-001 the vocabulary', () => {
  it('MSG-001 the vocabulary has the ten concepts in both languages and no empty word', () => {
    expect(Object.keys(VOCABULARY).sort()).toEqual([...CONCEPTS].sort());
    for (const row of Object.values(VOCABULARY)) {
      expect(row.en.trim()).not.toBe('');
      expect(row.es.trim()).not.toBe('');
    }
    expect(VOCABULARY.test.es).toBe('Prueba');
    expect(VOCABULARY.resultSimulation.en).toBe('Simulation result');
  });

  it('MSG-001 the Spanish vocabulary is in the neutral register of decision D-10', () => {
    for (const row of Object.values(VOCABULARY)) expect(VOSEO_MARKERS.test(row.es)).toBe(false);
  });
});

describe('MSG-006 formatters', () => {
  const hash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
  it('MSG-006 a hash is shortened, a size has its unit and a time follows the locale', () => {
    expect(formatHash(hash)).toBe('a1b2c3d4…');
    expect(formatSize(302, 'en')).toBe('302 bytes');
    expect(formatSize(1, 'en')).toBe('1 byte');
    expect(formatSize(1229, 'en')).toBe('1.2 KB');
    expect(formatSize(1229, 'es')).toBe('1,2 KB');
    expect(formatSize(5 * 1024 * 1024, 'en')).toBe('5 MB');
    expect(formatTime(250, 'en')).toBe('250 ms');
    expect(formatTime(1500, 'en')).toBe('1.5 s');
    expect(formatTime(1500, 'es')).toBe('1,5 s');
    const date = new Date(2026, 10, 13, 14, 5);
    expect(formatTime(date, 'en')).toBe(new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date));
    expect(formatTime(date, 'es')).not.toBe(formatTime(date, 'en'));
  });
});
