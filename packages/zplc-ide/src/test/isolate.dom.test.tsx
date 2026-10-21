import { describe, expect, it } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { releaseStaleDom } from './isolate';
import { setupDom } from './dom';

const dom = await setupDom();

describe('releaseStaleDom (a render test file that fails while it loads leaves happy-dom registered)', () => {
  it('puts the registered DOM away so that the next file starts without a window', async () => {
    expect(typeof document).toBe('object');
    expect(await releaseStaleDom()).toBe(true);
    expect(GlobalRegistrator.isRegistered).toBe(false);
    expect(typeof document).toBe('undefined');
    expect(await releaseStaleDom()).toBe(false);
    // the harness unregisters in its afterAll
    GlobalRegistrator.register({ url: 'http://localhost/' });
    expect(dom.t).toBeDefined();
  });
});
