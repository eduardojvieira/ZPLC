import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { announce, resetAnnouncements } from '../utils/announce';
import { LiveRegions } from './LiveRegions';

const dom = await setupDom();

describe('Live regions (UX-026) in a DOM', () => {
  it('update in place when something is announced, politely and assertively', () => {
    resetAnnouncements();
    dom.render(<LiveRegions />);
    expect(dom.screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
    dom.act(() => {
      announce('Build succeeded');
      announce('Connection lost', 'assertive');
    });
    expect(dom.screen.getByRole('status').textContent).toBe('Build succeeded');
    expect(document.querySelector('[data-live-region="assertive"]')?.textContent).toBe('Connection lost');
  });

  it('read a repeated message again by changing its text', () => {
    resetAnnouncements();
    dom.render(<LiveRegions />);
    dom.act(() => announce('Saved'));
    const first = dom.screen.getByRole('status').textContent;
    dom.act(() => announce('Saved'));
    expect(dom.screen.getByRole('status').textContent).not.toBe(first);
    expect(dom.screen.getByRole('status').textContent?.trim()).toBe('Saved');
  });
});
