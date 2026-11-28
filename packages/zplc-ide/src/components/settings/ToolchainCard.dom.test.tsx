import { afterEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../../test/dom';

const dom = await setupDom();
const { ToolchainCard } = await import('./ToolchainCard');

const host = window as unknown as { electronAPI?: unknown };

afterEach(() => {
  delete host.electronAPI;
});

describe('firmware toolchain row (UXV-004) in a DOM', () => {
  it('UXV-004 says the status badge in Spanish before the check and while it runs', async () => {
    host.electronAPI = { toolchain: { inspect: () => new Promise(() => undefined) } };
    const es = dom.tFor('es');
    const { user } = dom.render(<ToolchainCard ideId={undefined} />, { locale: 'es' });
    expect(dom.screen.getByRole('status').textContent).toBe(es('toolchain.status.notChecked'));
    expect(es('toolchain.status.notChecked')).toBe('Sin comprobar');
    await user.click(dom.screen.getByRole('button', { name: es('toolchain.chooseCheckoutCheck') }));
    expect(dom.screen.getByRole('status').textContent).toBe(es('toolchain.status.checking'));
    expect(es('toolchain.status.checking')).toBe('Comprobando…');
  });
});
