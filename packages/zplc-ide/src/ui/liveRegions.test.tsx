import { beforeEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { announce, resetAnnouncements } from '../utils/announce';
import { auditMarkup } from './audit';
import { LiveRegions } from './LiveRegions';

describe('the live regions of the shared announcer (UX-026)', () => {
  beforeEach(resetAnnouncements);

  it('are on the page before anything is announced: one polite status and one assertive alert, both hidden from sight', () => {
    const html = renderToStaticMarkup(<LiveRegions />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    // no role="alert": the assertive region is only a live region, so a screen counts the alerts that are really on it
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html.match(/ui-visually-hidden/g)?.length).toBe(2);
    expect(auditMarkup(html)).toEqual([]);
  });

  it('hold the last message of each politeness, and a repeated message changes the text so that it is read again', () => {
    announce('Build succeeded');
    announce('Connection failed', 'assertive');
    const first = renderToStaticMarkup(<LiveRegions />);
    expect(first).toMatch(/data-live-region="polite"[^>]*>Build succeeded/);
    expect(first).toMatch(/data-live-region="assertive"[^>]*>Connection failed/);
    announce('Build succeeded');
    const second = renderToStaticMarkup(<LiveRegions />);
    expect(second).not.toBe(first);
    expect(second).toMatch(/data-live-region="polite"[^>]*>Build succeeded/);
  });
});
