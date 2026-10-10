import { describe, expect, it } from 'bun:test';
import { createElement, type ReactElement } from 'react';
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

/** A boundary instance driven by hand: the repository has no DOM renderer, so the lifecycle React runs is replayed here. */
function mountedBoundary(region: string, children: ReactElement) {
  const boundary = new ErrorBoundary({ region, children });
  boundary.setState = ((update: unknown) => {
    const next = typeof update === 'function' ? (update as (state: typeof boundary.state, props: typeof boundary.props) => object)(boundary.state, boundary.props) : update;
    boundary.state = { ...boundary.state, ...(next as object) };
  }) as typeof boundary.setState;
  const fail = (error: unknown) => { boundary.state = { ...boundary.state, ...ErrorBoundary.getDerivedStateFromError(error) }; };
  return { boundary, fail };
}

describe('a region that throws (IDE-011)', () => {
  it('replaces only its own children with the error and a Retry that renders them again', () => {
    const content = createElement('p', null, 'editor content');
    const { boundary, fail } = mountedBoundary('Editor', content);
    expect(boundary.render()).toBe(content);
    fail(new Error('Cannot read properties of undefined'));
    const shown = boundary.render() as ReactElement<{ region: string; error: Error; onRetry: () => void }>;
    expect(shown.type).toBe(RegionError);
    expect(shown.props.region).toBe('Editor');
    expect(shown.props.error.message).toBe('Cannot read properties of undefined');
    shown.props.onRetry();
    expect(boundary.render()).toBe(content);
  });

  it('keeps two regions independent: one failing does not change what the other renders', () => {
    const editor = mountedBoundary('Editor', createElement('p', null, 'editor'));
    const panel = mountedBoundary('Panel', createElement('p', null, 'panel'));
    editor.fail(new Error('boom'));
    expect((editor.boundary.render() as ReactElement).type).toBe(RegionError);
    expect(renderToStaticMarkup(panel.boundary.render())).toBe('<p>panel</p>');
  });

  it('shows the error again when the retried content fails again, instead of a blank region', () => {
    const { boundary, fail } = mountedBoundary('Panel', createElement('p', null, 'panel'));
    fail(new Error('first'));
    (boundary.render() as ReactElement<{ onRetry: () => void }>).props.onRetry();
    fail(new Error('second'));
    const shown = boundary.render() as ReactElement<{ error: Error }>;
    expect(shown.props.error.message).toBe('second');
    expect(renderToStaticMarkup(shown)).toContain('Retry');
  });
});
