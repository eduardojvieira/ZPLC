// The hardware track strip of the Learn home (LRN-013, LRN-024): the learner's board, chosen with the kit's toggle group, and
// the lessons passed on hardware, named apart from the course's simulation passes.
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { learnHardwareEn, learnHardwareEs } from '../i18n/catalog/learnHardware';
import { setupDom } from '../test/dom';
import { auditMarkup } from '../ui/audit';
import { LearnBoardTrackView } from './LearnBoardTrack';

const dom = await setupDom();

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

describe('UXF-4 Learn hardware track scrolls inline inside the Learn scroll container', () => {
  it('places the hardware track inside the scroll container after the course without shrink-0 pinning', () => {
    const { container } = dom.render(
      <LearnBoardTrackView board={null} passedOnHardware={[]} onChoose={() => undefined}>
        <div data-home>course</div>
      </LearnBoardTrackView>,
    );
    const home = container.querySelector('[data-home]') as HTMLElement;
    const hardware = container.querySelector('[data-learn-hardware]') as HTMLElement;
    const scrollContainer = hardware.closest('.overflow-y-auto') as HTMLElement | null;

    expect(hardware.classList.contains('shrink-0')).toBe(false);
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer!.contains(home)).toBe(true);
    expect(Boolean(home.compareDocumentPosition(hardware) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('keeps board selection working and preserves home-above-hardware order in the DOM', async () => {
    const onChoose = mock(() => undefined);
    const { user, container } = dom.render(
      <LearnBoardTrackView board={null} passedOnHardware={[]} onChoose={onChoose}>
        <div data-home>course</div>
      </LearnBoardTrackView>,
    );
    await user.click(dom.screen.getByRole('button', { name: 'Raspberry Pi Pico' }));
    expect(onChoose).toHaveBeenCalledWith('rpi-pico-rp2040');
    const home = container.querySelector('[data-home]') as HTMLElement;
    const hardware = container.querySelector('[data-learn-hardware]') as HTMLElement;
    expect(Boolean(home.compareDocumentPosition(hardware) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
