// The hardware track strip of the Learn home (LRN-013, LRN-024): the learner's board, chosen with the kit's toggle group, and
// the lessons passed on hardware, named apart from the course's simulation passes.
import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { learnHardwareEn, learnHardwareEs } from '../i18n/catalog/learnHardware';
import { auditMarkup } from '../ui/audit';
import { LearnBoardTrackView } from './LearnBoardTrack';

const render = (board: 'rpi-pico-rp2040' | 'esp32-s3-devkitc' | null, passedOnHardware: string[] = []): string =>
  renderToStaticMarkup(
    <LearnBoardTrackView board={board} passedOnHardware={passedOnHardware} onChoose={() => undefined}>
      <p data-home>home</p>
    </LearnBoardTrackView>,
  );
const pressed = (out: string): string[] => [...out.matchAll(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)</g)].map((match) => match[1]!);

describe('the board of the hardware track in the Learn home (LRN-013)', () => {
  it('LRN-013 offers both learner boards in one labelled group, none chosen until the learner chooses', () => {
    const out = render(null);
    expect(out).toContain('role="group" aria-label="Your board"');
    expect(out).toContain('>Raspberry Pi Pico</button>');
    expect(out).toContain('>ESP32-S3-DevKitC-1</button>');
    expect(pressed(out)).toEqual([]);
    expect(out).toContain('No board chosen yet.');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('LRN-013 marks the chosen board as pressed and says which it is in words', () => {
    const out = render('esp32-s3-devkitc');
    expect(pressed(out)).toEqual(['ESP32-S3-DevKitC-1']);
    expect(out).toContain('Board for the hardware track: ESP32-S3-DevKitC-1');
  });

  it('LRN-013 keeps the Learn home above the strip', () => {
    const out = render(null);
    expect(out.indexOf('data-home')).toBeLessThan(out.indexOf('data-learn-hardware'));
  });
});

describe('a pass on hardware is shown apart from a pass in simulation (LRN-024)', () => {
  it('LRN-024 lists the lessons passed on hardware under their own label, and says when there is none', () => {
    expect(render('rpi-pico-rp2040', ['First blink', 'Seal-in'])).toContain('Passed on hardware: First blink, Seal-in');
    expect(render('rpi-pico-rp2040')).toContain('No lesson has been passed on hardware yet.');
  });

  it('LRN-024 has every string of the hardware track in English and Spanish', () => {
    expect(Object.keys(learnHardwareEs).sort()).toEqual(Object.keys(learnHardwareEn).sort());
    for (const value of Object.values(learnHardwareEs)) expect(value.length).toBeGreaterThan(0);
  });
});
