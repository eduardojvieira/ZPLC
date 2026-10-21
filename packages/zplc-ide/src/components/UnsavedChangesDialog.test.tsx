import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UnsavedChangesDialog } from './UnsavedChangesDialog';

const render = (props: Partial<Parameters<typeof UnsavedChangesDialog>[0]> = {}) =>
  renderToStaticMarkup(
    <UnsavedChangesDialog title="Unsaved changes" items={['Motor.st', 'main.ld.json']} onChoice={() => undefined} {...props} />,
  );

describe('unsaved changes dialog', () => {
  it('UX-020 names the title and every modified item in an alert dialog', () => {
    const html = render();
    expect(html).toContain('Unsaved changes');
    expect(html).toContain('Motor.st');
    expect(html).toContain('main.ld.json');
    expect(html).toContain('role="alertdialog"');
  });

  it('UX-020 offers cancel first so the safe answer takes the initial focus, then discard and save', () => {
    const html = render({ saveLabel: 'Save and close', discardLabel: 'Discard and close' });
    const order = ['>Cancel<', '>Discard and close<', '>Save and close<'].map((label) => html.indexOf(label));
    expect(order.every((index) => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('disables every answer while a save is running', () => {
    const html = render({ busy: true });
    expect(html.match(/disabled=""/g)?.length).toBe(3);
    expect(html).toContain('Saving…');
  });
});
