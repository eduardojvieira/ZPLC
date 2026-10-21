import { describe, expect, it, mock } from 'bun:test';
import { useState } from 'react';
import { isFocused, setupDom } from '../test/dom';
import { AlertDialog, Button, Dialog } from './index';

const dom = await setupDom();

function Host({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        title="Rename task"
        description="Pick a new name"
      >
        <input aria-label="New name" />
        <Button>Apply</Button>
      </Dialog>
    </>
  );
}

describe('Dialog (UX-001) in a DOM', () => {
  it('is a modal dialog named by its title and described by its description, with focus moved inside', async () => {
    const { user } = dom.render(<Host />);
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    await user.click(dom.screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = dom.screen.getByRole('dialog', { name: 'Rename task', description: 'Pick a new name' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('Escape closes it and returns focus to the button that opened it', async () => {
    const onClose = mock(() => undefined);
    const { user } = dom.render(<Host onClose={onClose} />);
    await user.click(dom.screen.getByRole('button', { name: 'Open dialog' }));
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(dom.screen.queryByRole('dialog')).toBeNull();
    expect(isFocused(dom.screen.getByRole('button', { name: 'Open dialog' }))).toBe(true);
  });

  it('the close button is named from the catalog and closes it', async () => {
    const { user } = dom.render(<Host />);
    await user.click(dom.screen.getByRole('button', { name: 'Open dialog' }));
    await user.click(dom.screen.getByRole('button', { name: dom.t('workbench.dialog.close') }));
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps Tab inside the dialog', async () => {
    const { user } = dom.render(<Host />);
    await user.click(dom.screen.getByRole('button', { name: 'Open dialog' }));
    const dialog = dom.screen.getByRole('dialog');
    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let step = 0; step < 6; step += 1) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('a press on the scrim closes it', async () => {
    const { user } = dom.render(<Host />);
    await user.click(dom.screen.getByRole('button', { name: 'Open dialog' }));
    await user.click(document.querySelector('.ui-scrim') as Element);
    expect(dom.screen.queryByRole('dialog')).toBeNull();
  });
});

describe('AlertDialog (UX-001) in a DOM', () => {
  const alert = (props: Partial<Parameters<typeof AlertDialog>[0]> = {}) => (
    <AlertDialog
      open
      title="Delete task"
      description="This cannot be undone"
      actionLabel="Delete"
      cancelLabel="Keep"
      destructive
      onAction={() => undefined}
      onCancel={() => undefined}
      {...props}
    />
  );

  it('is an alert dialog and the safe answer takes the focus', () => {
    dom.render(alert());
    dom.screen.getByRole('alertdialog', { name: 'Delete task', description: 'This cannot be undone' });
    expect(isFocused(dom.screen.getByRole('button', { name: 'Keep' }))).toBe(true);
  });

  it('Enter on the focused cancel answers cancel; clicking the action answers action', async () => {
    const onAction = mock(() => undefined);
    const onCancel = mock(() => undefined);
    const { user } = dom.render(alert({ onAction, onCancel }));
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await user.click(dom.screen.getByRole('button', { name: 'Delete' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels, and a scrim press does not', async () => {
    const onCancel = mock(() => undefined);
    const { user } = dom.render(alert({ onCancel }));
    await user.click(document.querySelector('.ui-scrim') as Element);
    expect(onCancel).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('while busy every answer is disabled and Escape does not cancel', async () => {
    const onCancel = mock(() => undefined);
    const { user } = dom.render(alert({ busy: true, onCancel, secondary: { label: 'Archive', onSelect: () => undefined } }));
    for (const name of ['Keep', 'Archive', 'Delete'])
      expect((dom.screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
