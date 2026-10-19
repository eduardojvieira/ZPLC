import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { AppNotification } from '../store/notifications';
import { NotificationList } from './NotificationsList';

const item = (patch: Partial<AppNotification>): AppNotification => ({ id: 'a', kind: 'build', status: 'success', title: 'Build succeeded', details: 'output', startedAt: 0, finishedAt: 1, ...patch });
const noop = () => undefined;

describe('the notification list (IDE-021)', () => {
  it('renders nothing when there is nothing to say', () => {
    expect(renderToStaticMarkup(<NotificationList items={[]} onOpenDetails={noop} onDismiss={noop} />)).toBe('');
  });

  it('shows a result with a link to its details and a way to dismiss it', () => {
    const html = renderToStaticMarkup(<NotificationList items={[item({ detail: 'Motor.zplc, 420 bytes' })]} onOpenDetails={noop} onDismiss={noop} />);
    expect(html).toContain('data-notification="build"');
    expect(html).toContain('data-status="success"');
    expect(html).toContain('Build succeeded');
    expect(html).toContain('Motor.zplc, 420 bytes');
    expect(html).toContain('>Details<');
    expect(html).toContain('aria-label="Dismiss: Build succeeded"');
    expect(html).not.toContain('role="progressbar"');
  });

  it('names the panel that Details opens, for a failure that belongs in Problems', () => {
    const html = renderToStaticMarkup(<NotificationList items={[item({ status: 'error', title: 'Build failed', details: 'problems' })]} onOpenDetails={noop} onDismiss={noop} />);
    expect(html).toContain('data-status="error"');
    // the shared announcer reads it (store/notifications.ts); the list has no live region of its own
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('aria-live');
    expect(html).toContain('data-details="problems"');
    expect(html).toContain('aria-label="Details: Build failed (Problems)"');
  });

  it('shows a running operation with progress and a cancel action only when it can be stopped', () => {
    const stoppable = renderToStaticMarkup(<NotificationList items={[item({ status: 'running', title: 'Building project', finishedAt: undefined, cancel: noop })]} onOpenDetails={noop} onDismiss={noop} />);
    expect(stoppable).toContain('role="progressbar"');
    expect(stoppable).toContain('aria-label="Cancel: Building project"');
    expect(stoppable).toContain('aria-busy="true"');
    const unstoppable = renderToStaticMarkup(<NotificationList items={[item({ status: 'running', kind: 'deploy', title: 'Deploying program', finishedAt: undefined })]} onOpenDetails={noop} onDismiss={noop} />);
    expect(unstoppable).toContain('role="progressbar"');
    expect(unstoppable).not.toContain('Cancel');
  });

  it('shows the recovery action of a failure and runs it', () => {
    let tried = 0;
    const html = renderToStaticMarkup(<NotificationList items={[item({ status: 'error', kind: 'save', title: 'Could not save Motor.st', recover: { label: 'Try again', run: () => { tried += 1; } } })]} onOpenDetails={noop} onDismiss={noop} />);
    expect(html).toContain('data-recover');
    expect(html).toContain('>Try again<');
    expect(tried).toBe(0);
  });
});
