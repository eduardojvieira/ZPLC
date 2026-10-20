// The learner's board on the hardware track (LRN-013): one of the two learner boards, chosen once and kept across restarts.
import { describe, expect, it } from 'bun:test';

import { LEARNER_BOARDS, createLearnBoardState } from './learnBoard';

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, items };
}

describe('the board of the hardware track (LRN-013)', () => {
  it('LRN-013 offers the Raspberry Pi Pico and the ESP32-S3-DevKitC-1, by their ids in boards.json', () => {
    expect(LEARNER_BOARDS).toEqual(['rpi-pico-rp2040', 'esp32-s3-devkitc']);
  });

  it('LRN-013 starts with no board, keeps the one the learner chooses, and reads it back after a restart', () => {
    const storage = memoryStorage();
    const first = createLearnBoardState(storage);
    expect(first.getState().board).toBeNull();
    first.getState().choose('esp32-s3-devkitc');
    expect(first.getState().board).toBe('esp32-s3-devkitc');
    expect(createLearnBoardState(storage).getState().board).toBe('esp32-s3-devkitc');
    first.getState().choose('rpi-pico-rp2040');
    expect(createLearnBoardState(storage).getState().board).toBe('rpi-pico-rp2040');
  });

  it('LRN-013 ignores a stored value that is not a learner board, and works without storage or with one that throws', () => {
    expect(createLearnBoardState(memoryStorage({ 'zplc-learn-board': 'nucleo-h743zi' })).getState().board).toBeNull();
    const none = createLearnBoardState(undefined);
    none.getState().choose('rpi-pico-rp2040');
    expect(none.getState().board).toBe('rpi-pico-rp2040');
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const store = createLearnBoardState(broken);
    expect(store.getState().board).toBeNull();
    store.getState().choose('esp32-s3-devkitc');
    expect(store.getState().board).toBe('esp32-s3-devkitc');
  });
});
