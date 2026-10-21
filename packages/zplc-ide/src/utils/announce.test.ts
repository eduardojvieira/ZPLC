import { beforeEach, describe, expect, it } from 'bun:test';
import { announce, announcementsSnapshot, resetAnnouncements, subscribeAnnouncements } from './announce';

describe('the shared announcer (UX-026)', () => {
  beforeEach(resetAnnouncements);

  it('puts a message in the polite region unless it is a fault, which goes to the assertive one', () => {
    announce('Build succeeded');
    announce('Connection failed', 'assertive');
    const { polite, assertive } = announcementsSnapshot();
    expect(polite.message).toBe('Build succeeded');
    expect(assertive.message).toBe('Connection failed');
  });

  it('numbers each message, so that the same text twice in a row is a change a region can render', () => {
    announce('Saved');
    const first = announcementsSnapshot().polite.seq;
    announce('Saved');
    expect(announcementsSnapshot().polite.seq).toBeGreaterThan(first);
  });

  it('keeps one snapshot object between changes and tells every subscriber of a change, until it unsubscribes', () => {
    let heard = 0;
    const stop = subscribeAnnouncements(() => {
      heard += 1;
    });
    const before = announcementsSnapshot();
    expect(announcementsSnapshot()).toBe(before);
    announce('Saved');
    expect(heard).toBe(1);
    expect(announcementsSnapshot()).not.toBe(before);
    stop();
    announce('Saved again');
    expect(heard).toBe(1);
  });

  it('says nothing for an empty message', () => {
    announce('   ');
    expect(announcementsSnapshot().polite.message).toBe('');
  });
});
