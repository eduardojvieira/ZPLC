import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ErrorBoundary, RegionError } from './ErrorBoundary';

describe('error boundary state', () => {
  it('keeps the error that a child threw', () => {
    const error = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromError(error)).toEqual({ error });
  });

  it('wraps a thrown non-error so the fallback can always describe it', () => {
    const state = ErrorBoundary.getDerivedStateFromError('boom');
    expect(state.error).toBeInstanceOf(Error);
    expect(state.error?.message).toBe('boom');
  });

  it('clears the error when the reset key changes and keeps it otherwise', () => {
    const error = new Error('boom');
    expect(ErrorBoundary.getDerivedStateFromProps({ region: 'Editor', resetKey: 'file:b', children: null }, { error, resetKey: 'file:a' }))
      .toEqual({ error: null, resetKey: 'file:b' });
    expect(ErrorBoundary.getDerivedStateFromProps({ region: 'Editor', resetKey: 'file:a', children: null }, { error, resetKey: 'file:a' })).toBeNull();
  });

  it('renders its children when nothing failed', () => {
    const html = renderToStaticMarkup(<ErrorBoundary region="Editor"><p>editor content</p></ErrorBoundary>);
    expect(html).toBe('<p>editor content</p>');
  });
});

describe('region error', () => {
  it('names the region, shows the message and offers a retry', () => {
    const html = renderToStaticMarkup(<RegionError region="Editor" error={new Error('Cannot read properties of undefined')} onRetry={() => undefined} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-region-error="Editor"');
    expect(html).toContain('Editor stopped working');
    expect(html).toContain('Cannot read properties of undefined');
    expect(html).toContain('>Retry<');
  });

  it('offers an extra recovery action when the region has one', () => {
    const html = renderToStaticMarkup(<RegionError region="ZPLC Studio" error={new Error('boom')} onRetry={() => undefined} recovery={{ label: 'Close project', run: () => undefined }} />);
    expect(html).toContain('>Close project<');
    expect(renderToStaticMarkup(<RegionError region="Editor" error={new Error('boom')} onRetry={() => undefined} />)).not.toContain('Close project');
  });
});
