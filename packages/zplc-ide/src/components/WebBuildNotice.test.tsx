import { afterEach, describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { WEB_MISSING_FEATURES } from '../platform/webCapabilities';
import { WebBuildNotice, WebBuildNoticeView } from './WebBuildNotice';

describe('the notice of the web build (REL-037)', () => {
  afterEach(() => {
    delete (globalThis as { __ZPLC_WEB_BUILD__?: boolean }).__ZPLC_WEB_BUILD__;
  });

  it('REL-037: lists every missing feature from the table and links to the install page', () => {
    const html = renderToStaticMarkup(<WebBuildNoticeView onDismiss={() => undefined} />);
    for (const id of WEB_MISSING_FEATURES) expect(html).toContain(`data-web-feature="${id}"`);
    expect(html).toContain('You are using ZPLC in the browser.');
    expect(html).toContain('href="../docs/getting-started/install/"');
    expect(html).not.toContain('https://');
    expect(html).toContain('Device connection and deploy');
  });

  it('REL-037: shows nothing in the desktop app and the notice in the web build', () => {
    expect(renderToStaticMarkup(<WebBuildNotice />)).toBe('');
    (globalThis as { __ZPLC_WEB_BUILD__?: boolean }).__ZPLC_WEB_BUILD__ = true;
    expect(renderToStaticMarkup(<WebBuildNotice />)).toContain('data-web-build-notice');
  });
});
