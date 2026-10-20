import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { updateNotice } from '../ipc/updateNotice';
import { UpdateNoticeView } from './UpdateNotice';

const notice = updateNotice({ status: 'available', current: '2.0.0-rc.4', latest: '2.0.0', url: 'https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.0' }, 'linux', null)!;

describe('the update notice (REL-021)', () => {
  it('says which release exists, shows its address and how to update, and can be dismissed', () => {
    const html = renderToStaticMarkup(<UpdateNoticeView notice={notice} onDismiss={() => undefined} />);
    expect(html).toContain('ZPLC 2.0.0 is available');
    expect(html).toContain('this is 2.0.0-rc.4');
    expect(html).toContain('https://github.com/eduardojvieira/ZPLC/releases/tag/v2.0.0');
    expect(html).toContain('How to update');
    expect(html).toContain('sudo apt install');
    expect(html).toContain('aria-label="Dismiss the notice about ZPLC 2.0.0"');
    expect(html).toContain('ZPLC does not download or install anything');
  });

  it('offers no download or install control: the only button dismisses', () => {
    const html = renderToStaticMarkup(<UpdateNoticeView notice={notice} onDismiss={() => undefined} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).not.toContain('<a ');
  });
});
