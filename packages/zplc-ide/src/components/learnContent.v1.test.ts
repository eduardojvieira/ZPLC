// What the Learn content contract exposes of a lesson's reading page (LRN-039, LRN-042): the index entry's reading, validated
// like the rest of the content, and no change at all for a lesson without one.
import { describe, expect, it } from 'bun:test';

import { LESSON_INDEX } from '../generated/lessonIndex';
import type { LessonIndexEntry } from '../learn/lessonPackage';
import type { LessonReading } from '../learn/readingTypes';
import { createLearnContentV1, learnLessonOf, validateLearnContentV1 } from './learnContent.v1';

const reading: LessonReading = {
  en: '## A page\n\nWords.\n',
  es: '## Una página\n\nPalabras.\n',
  files: { 'reading/fig.ld.json': '{}' },
  images: ['images/panel.svg'],
};
const entry = LESSON_INDEX.lessons[0]!;
const withReading = (value: LessonReading): LessonIndexEntry => ({ ...entry, reading: value });
const catalog = (value: LessonIndexEntry) => ({
  es: createLearnContentV1('es', [value]),
  en: createLearnContentV1('en', [value]),
});

describe('the reading page in the Learn content (LRN-039)', () => {
  it('exposes the reading of a lesson that has one, in both languages', () => {
    expect(learnLessonOf(withReading(reading), 'en').reading).toEqual(reading);
    expect(learnLessonOf(withReading(reading), 'es').reading).toEqual(reading);
  });

  it('leaves a lesson without reading exactly as it was: no reading key, and the catalog still validates', () => {
    const lesson = learnLessonOf(entry, 'en');
    expect(lesson.reading).toBeUndefined();
    expect('reading' in lesson).toBe(false);
    expect(validateLearnContentV1(catalog(entry))).toBe(true);
    expect(
      validateLearnContentV1({
        es: createLearnContentV1('es', LESSON_INDEX.lessons),
        en: createLearnContentV1('en', LESSON_INDEX.lessons),
      }),
    ).toBe(true);
  });

  it('validates a whole reading and rejects one with a page that does not parse, an empty page or a bad file or image path', () => {
    expect(validateLearnContentV1(catalog(withReading(reading)))).toBe(true);
    for (const broken of [
      { ...reading, es: '# A title is not allowed\n' },
      { ...reading, en: '   ' },
      { ...reading, files: { 'elsewhere/fig.ld.json': '{}' } },
      { ...reading, images: ['panel.svg'] },
    ])
      expect(validateLearnContentV1(catalog(withReading(broken)))).toBe(false);
  });

  it('rejects two languages that carry a different reading', () => {
    const other = { ...learnLessonOf(withReading(reading), 'en'), reading: { ...reading, en: '## Another\n' } };
    expect(validateLearnContentV1({ es: [learnLessonOf(withReading(reading), 'es')], en: [other] })).toBe(false);
  });
});
