import { describe, expect, it } from 'bun:test';
import { EventEmitter } from 'node:events';
import { createCloseGuard, type GuardedAction } from './closeGuard.js';
import type { InputLike } from './appMenu.js';
import { completeGuardedAction, createReloadRequest, guardReloadChord, guardWindowClose } from './windowGuards.js';

// IDE-005 by behaviour: the window, the reload chord and the answer of the user, with the event objects of Electron
// replaced by emitters. The real key press and the real window close are in journeys 10 and 53.
const veto = () => {
  const event = {
    prevented: false,
    preventDefault() {
      this.prevented = true;
    },
  };
  return event;
};
const chord = (overrides: Partial<InputLike> = {}): InputLike => ({
  type: 'keyDown',
  key: 'r',
  control: true,
  meta: false,
  alt: false,
  ...overrides,
});

describe('window close and application quit (IDE-005)', () => {
  const setup = (dirty: boolean) => {
    const window = new EventEmitter();
    const guard = createCloseGuard();
    guard.setDirty(dirty);
    const asked: GuardedAction[] = [];
    guardWindowClose(window as never, guard, (action) => asked.push(action));
    return { window, guard, asked };
  };

  it('keeps the window and asks the renderer while files are modified', () => {
    const { window, asked } = setup(true);
    const event = veto();
    window.emit('close', event);
    expect(event.prevented).toBe(true);
    expect(asked).toEqual(['close']);
  });

  it('closes the window without asking when nothing is modified', () => {
    const { window, asked } = setup(false);
    const event = veto();
    window.emit('close', event);
    expect(event.prevented).toBe(false);
    expect(asked).toEqual([]);
  });

  it('asks again after Cancel, because the work is still unsaved: quitting twice does not lose it', () => {
    const { window, asked } = setup(true);
    window.emit('close', veto());
    const second = veto();
    window.emit('close', second);
    expect(second.prevented).toBe(true);
    expect(asked).toEqual(['close', 'close']);
  });

  it('lets the close through when the renderer is gone and nobody can answer', () => {
    const { window, guard } = setup(true);
    guard.release();
    const event = veto();
    window.emit('close', event);
    expect(event.prevented).toBe(false);
  });
});

describe('reload shortcuts (IDE-005)', () => {
  const setup = (options: { isPackaged: boolean; dirty: boolean }) => {
    const contents = new EventEmitter();
    const guard = createCloseGuard();
    guard.setDirty(options.dirty);
    const log: string[] = [];
    const requestReload = createReloadRequest({ guard, reload: () => log.push('reload'), ask: (action) => log.push(`ask:${action}`) });
    guardReloadChord(contents as never, { isPackaged: options.isPackaged, requestReload });
    return { contents, guard, log };
  };

  it('does nothing in a packaged build, whatever is modified: the chord is taken and no reload or question follows', () => {
    for (const dirty of [true, false]) {
      const { contents, log } = setup({ isPackaged: true, dirty });
      const event = veto();
      contents.emit('before-input-event', event, chord());
      expect(event.prevented).toBe(true);
      expect(log).toEqual([]);
    }
  });

  it('asks in a development host with modified files, and reloads only after the user chose save or discard', () => {
    const { contents, guard, log } = setup({ isPackaged: false, dirty: true });
    const event = veto();
    contents.emit('before-input-event', event, chord({ key: 'R' }));
    expect(event.prevented).toBe(true);
    expect(log).toEqual(['ask:reload']);
    // Cancel sends nothing; the answer of save or discard is confirmed once and completes the held action.
    expect(guard.confirm()).toBe('reload');
    completeGuardedAction('reload', { reload: () => log.push('reload'), destroy: () => log.push('destroy') });
    expect(log).toEqual(['ask:reload', 'reload']);
  });

  it('reloads a development host straight away when nothing is modified', () => {
    const { contents, log } = setup({ isPackaged: false, dirty: false });
    contents.emit('before-input-event', veto(), chord({ meta: true, control: false }));
    expect(log).toEqual(['reload']);
  });

  it('leaves every key that is not a reload chord to the page', () => {
    const { contents, log } = setup({ isPackaged: false, dirty: true });
    for (const input of [chord({ control: false }), chord({ type: 'keyUp' }), chord({ key: 'F5', control: false }), chord({ alt: true })]) {
      const event = veto();
      contents.emit('before-input-event', event, input);
      expect(event.prevented).toBe(false);
    }
    expect(log).toEqual([]);
  });
});

describe('the answer of the user (IDE-005)', () => {
  it('destroys the window for a confirmed close, so that the close handler does not ask a second time', () => {
    const log: string[] = [];
    completeGuardedAction('close', { reload: () => log.push('reload'), destroy: () => log.push('destroy') });
    expect(log).toEqual(['destroy']);
  });
});
