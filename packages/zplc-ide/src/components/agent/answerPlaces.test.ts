import { describe, expect, it } from 'bun:test';
import { splitPlaces } from './answerPlaces';

// AIX-004: a place in an answer (a file, a line, an element) is found in the text so that it can open on a click.
describe('the places of an answer (AIX-004)', () => {
  it('AIX-004 finds a file, a file with a line and the fixed project files', () => {
    const parts = splitPlaces('See src/Main.st:14, then plant-map.json and scene.json. Also tests/smoke.scenario.json.');
    expect(parts.filter((part) => 'place' in part).map((part) => 'place' in part && part.place)).toEqual([
      { type: 'goToLine', path: 'src/Main.st', line: 14 },
      { type: 'openFile', path: 'plant-map.json' },
      { type: 'openFile', path: 'scene.json' },
      { type: 'openFile', path: 'tests/smoke.scenario.json' },
    ]);
  });

  it('AIX-004 finds an element of a diagram and keeps the text between places unchanged', () => {
    const text = 'Check rung:r1 and block:and_1, then step:s2.';
    const parts = splitPlaces(text);
    expect(parts.map((part) => ('place' in part ? part.raw : part.text)).join('')).toBe(text);
    expect(parts.filter((part) => 'element' in part).map((part) => 'element' in part && part.element)).toEqual([
      'rung:r1',
      'block:and_1',
      'step:s2',
    ]);
  });

  it('AIX-004 does not take a sentence full stop, a URL or a word that only looks like a place', () => {
    const parts = splitPlaces('Open src/Main.st. Visit https://example.com/src/Main.st or read the step: it fails.');
    const places = parts.filter((part) => 'place' in part);
    expect(places).toHaveLength(1);
    expect('place' in places[0]! && places[0]!.place).toEqual({ type: 'openFile', path: 'src/Main.st' });
  });
});
