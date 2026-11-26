import { describe, expect, it } from 'bun:test';
import { setupDom } from '../../test/dom';

const dom = await setupDom();
const { RungHeader } = await import('./LDRungParts');

const comment = 'Start the conveyor when the guard is closed, the e-stop is released and the operator holds the start button';
const rung = { id: 'r1', number: 1, comment };
const header = (readOnly: boolean) => (
  <div style={{ width: '200px' }}>
    <RungHeader rung={rung} cols={4} rows={1} readOnly={readOnly} onChange={() => undefined} />
  </div>
);
const target = () => dom.screen.getByText(`— ${comment}`) as HTMLElement;

describe('a shortened rung comment can be read whole (UXV-004)', () => {
  for (const readOnly of [false, true]) {
    const mode = readOnly ? 'read-only' : 'editable';

    it(`UXV-004 a ${mode} rung comment carries its full text and shows it on hover`, async () => {
      const { user } = dom.render(header(readOnly));
      expect(target().closest('[data-tooltip]')?.getAttribute('data-tooltip')).toBe(comment);
      await user.hover(target());
      await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toContain(comment));
    });

    it(`UXV-004 a ${mode} rung comment shows its full text on keyboard focus and describes itself`, async () => {
      const { user } = dom.render(header(readOnly));
      await user.tab();
      expect(document.activeElement?.textContent).toBe(`— ${comment}`);
      await dom.waitFor(() => expect(dom.screen.getByRole('tooltip').textContent).toContain(comment));
      expect((document.activeElement as HTMLElement).getAttribute('aria-describedby')).toBe(dom.screen.getByRole('tooltip').id);
    });
  }
});
