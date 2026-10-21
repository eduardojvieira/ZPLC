import { describe, expect, it, mock } from 'bun:test';
import { setupDom } from '../test/dom';
import { Button, Toast, ToastRegion } from './index';

const dom = await setupDom();

describe('Toast (UX-001) in a DOM', () => {
  it('an informational toast is a status and a danger toast is an alert', () => {
    dom.render(
      <ToastRegion label="Notifications">
        <Toast>Saved</Toast>
        <Toast tone="danger">Build failed</Toast>
      </ToastRegion>,
    );
    expect(dom.screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
    expect(dom.screen.getByRole('status').textContent).toBe('Saved');
    expect(dom.screen.getByRole('alert').textContent).toBe('Build failed');
  });

  it('its dismiss button is named, runs by click and by keyboard, and is absent without a handler', async () => {
    const onDismiss = mock(() => undefined);
    const { user } = dom.render(
      <Toast dismissLabel="Dismiss notification" onDismiss={onDismiss}>
        Saved
      </Toast>,
    );
    await user.click(dom.screen.getByRole('button', { name: 'Dismiss notification' }));
    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('keeps an action reachable by Tab', async () => {
    const onUndo = mock(() => undefined);
    const { user } = dom.render(<Toast action={<Button onClick={onUndo}>Undo</Button>}>Deleted</Toast>);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(dom.screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });
});
