import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditMarkup } from './audit';
import { AlertDialog } from './index';

const html = (node: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(node);
const noop = (): void => undefined;
const buttons = (markup: string): string[] => Array.from(markup.matchAll(/<button[^>]*>(.*?)<\/button>/g), (match) => match[1] ?? '');

describe('UX-020 alert dialog', () => {
  it('UX-020 puts Cancel first, then an optional secondary action, then the action that names the effect', () => {
    const out = html(
      <AlertDialog
        open
        title="Discard unsaved changes?"
        description="Changes to this project will be lost when it closes."
        cancelLabel="Continue editing"
        secondary={{ label: 'Discard changes and close', destructive: true, onSelect: noop }}
        actionLabel="Save all and close"
        onAction={noop}
        onCancel={noop}
      />,
    );
    expect(buttons(out)).toEqual(['Continue editing', 'Discard changes and close', 'Save all and close']);
    expect(out).toContain('role="alertdialog"');
    // The destructive secondary action is styled as such and the primary one is not.
    expect(out).toMatch(/data-variant="danger"[^>]*>Discard changes and close</);
    expect(out).toMatch(/data-variant="primary"[^>]*>Save all and close</);
    expect(auditMarkup(out)).toEqual([]);
  });

  it('UX-020 shows only Cancel when the dialog has nothing to confirm, and renders its body and wider size', () => {
    const out = html(
      <AlertDialog
        open
        title="Deploy blocked"
        description="The device does not match."
        cancelLabel="Close"
        actionLabel={null}
        size="lg"
        onAction={noop}
        onCancel={noop}
      >
        <table>
          <tbody>
            <tr>
              <td>Board</td>
            </tr>
          </tbody>
        </table>
      </AlertDialog>,
    );
    expect(buttons(out)).toEqual(['Close']);
    expect(out).toContain('data-size="lg"');
    expect(out).toContain('<td>Board</td>');
  });

  it('UX-020 keeps every control disabled while the action runs, so a second click cannot repeat it', () => {
    const out = html(
      <AlertDialog
        open
        busy
        title="Delete file"
        description="x"
        cancelLabel="Cancel"
        secondary={{ label: 'Other', onSelect: noop }}
        actionLabel="Delete file"
        onAction={noop}
        onCancel={noop}
        destructive
      />,
    );
    const disabled = Array.from(out.matchAll(/<button[^>]*disabled=""[^>]*>/g));
    expect(disabled.length).toBe(3);
  });
});
