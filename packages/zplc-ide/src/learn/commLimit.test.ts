import { describe, expect, it } from 'bun:test';
import { lessonNeedsComm } from './commLimit';

describe('the lessons that need the simulator communication', () => {
  it('are the Modbus and MQTT lessons, and no other', () => {
    expect(lessonNeedsComm('modbus-coil-fbd')).toBe(true);
    expect(lessonNeedsComm('modbus-register-round-trip')).toBe(true);
    expect(lessonNeedsComm('mqtt-publish-subscribe')).toBe(true);
    expect(lessonNeedsComm('blink-structured-text')).toBe(false);
    expect(lessonNeedsComm('no-such-lesson')).toBe(false);
  });
});
