import { describe, expect, it } from 'bun:test';
import { LESSON_INDEX } from '../generated/lessonIndex';
import { lessonNeedsComm } from './commLimit';

describe('the lessons that need the simulator communication', () => {
  it('are exactly the lessons whose hardware reason names the Modbus server or the MQTT broker', () => {
    const named = LESSON_INDEX.lessons
      .filter((lesson) => /Modbus|MQTT/.test(lesson.unsupported.hardware?.reason.en ?? ''))
      .map((lesson) => lesson.id)
      .sort();
    expect(named.length).toBeGreaterThan(0);
    expect(LESSON_INDEX.lessons.filter((lesson) => lessonNeedsComm(lesson.id)).map((lesson) => lesson.id).sort()).toEqual(named);
  });
});
