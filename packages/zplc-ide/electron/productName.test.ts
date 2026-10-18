import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

import { PRODUCT_NAME as RENDERER_PRODUCT_NAME } from '../src/productName';
import { PRODUCT_NAME } from './productName';

// D-03: the application is "ZPLC Studio". Each process keeps the name in one place (src/productName.ts for the renderer,
// electron/productName.ts for the main process, which tsc compiles on its own with rootDir electron), and the two must agree.
describe('UX-016 the product name has one home per process, and the homes agree', () => {
  it('UX-016 gives the main process and the renderer the same name', () => {
    expect(PRODUCT_NAME).toBe(RENDERER_PRODUCT_NAME);
    expect(PRODUCT_NAME).toBe('ZPLC Studio');
  });

  it('UX-016 gives the page the same title as the window, before the renderer sets any', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(PRODUCT_NAME);
  });
});
