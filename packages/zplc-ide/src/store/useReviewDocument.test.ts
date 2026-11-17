import { afterEach, describe, expect, it } from 'bun:test';
import { stubProjectLoader } from '../test/dom';

await stubProjectLoader();
const { useReviewDocument, REVIEW_VIEW_ID } = await import('./useReviewDocument');
const { useNotifications } = await import('./notifications');
const { useIDEStore } = await import('./useIDEStore');

afterEach(() => {
  useReviewDocument.setState({ open: false, active: false, requests: 0, review: { kind: 'idle' }, busy: false });
  useNotifications.setState({ items: [] });
});

describe('the review document store (SHL-004)', () => {
  it('SHL-004 showing the review document opens it and makes it the active view', () => {
    expect(REVIEW_VIEW_ID).toBe('review:changes');
    const before = useReviewDocument.getState().requests;
    useReviewDocument.getState().show();
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: true, requests: before + 1 });
    useReviewDocument.getState().deselect();
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: false });
    useReviewDocument.getState().select();
    expect(useReviewDocument.getState().active).toBe(true);
    useReviewDocument.getState().close();
    expect(useReviewDocument.getState()).toMatchObject({ open: false, active: false });
  });

  it('SHL-010 a proposed change raises one notice with a Review action and moves nothing', () => {
    const tabBefore = useIDEStore.getState().activeConsoleTab;
    const review = { kind: 'result', snapshot: { files: [] }, presentation: { kind: 'accepted', diagnostics: [], artifacts: [] } } as never;
    useReviewDocument.getState().propose(review);
    const { items } = useNotifications.getState();
    expect(items).toHaveLength(1);
    expect(items[0]?.recover?.label).toBe('Review');
    expect(useReviewDocument.getState()).toMatchObject({ open: false, active: false });
    expect(useIDEStore.getState().activeConsoleTab).toBe(tabBefore);
    items[0]!.recover!.run();
    expect(useReviewDocument.getState()).toMatchObject({ open: true, active: true });
  });
});
