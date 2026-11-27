import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';

const dom = await setupDom();
const { publishCommandState, resetCommandsForTest } = await import('../commands/bus');
const { EMPTY_REGIONS, EMPTY_STATE_KEY, RegionEmptyState, useEmptyStateSeen } = await import('./EmptyState');
const { commandById } = await import('../commands/registry');
const { en } = await import('../i18n/en');
const { es } = await import('../i18n/es');

beforeEach(() => {
  window.localStorage.removeItem(EMPTY_STATE_KEY);
  useEmptyStateSeen.setState({ taken: {} });
  publishCommandState({ projectOpen: true });
});
afterEach(() => resetCommandsForTest());

describe('first-time empty states (GDE-012, UX-021)', () => {
  it('GDE-012 each region names its one next action the first time it is shown empty', () => {
    expect([...EMPTY_REGIONS]).toEqual(['editor', 'problems', 'tests', 'watch', 'trace', 'plant', 'navigator']);
    for (const region of EMPTY_REGIONS) {
      const view = dom.render(<RegionEmptyState region={region} />);
      expect(view.container.textContent).toContain(dom.t(`u3Learn.empty.${region}.title`));
      expect(view.container.textContent).toContain(dom.t(`u3Learn.empty.${region}.description`));
      expect(view.container.querySelectorAll('button').length).toBe(1);
      view.unmount();
      // both languages have the text, and neither uses the old product name
      for (const catalog of [en, es] as Record<string, string>[]) {
        expect(catalog[`u3Learn.empty.${region}.title`]).toBeTruthy();
        expect(catalog[`u3Learn.empty.${region}.description`]).not.toContain('Studio');
      }
    }
  });

  it('GDE-012 the button is the registered command: it runs it and is named by its title', async () => {
    publishCommandState({ projectOpen: false });
    const { user, container } = dom.render(<RegionEmptyState region="navigator" />);
    const open = container.querySelector('button')!;
    expect(open.textContent).toBe(dom.t(commandById('file.open').titleKey));
    expect(open.hasAttribute('disabled')).toBe(false);
    await user.click(open);
    expect(useEmptyStateSeen.getState().taken.navigator).toBe(true);
  });

  it('GDE-012 the empty state does not return once the action was taken', async () => {
    const first = dom.render(<RegionEmptyState region="problems" />);
    await first.user.click(first.container.querySelector('button')!);
    first.unmount();
    // persisted per region, in a key of its own, and read again after a restart
    expect(JSON.parse(window.localStorage.getItem(EMPTY_STATE_KEY)!).state.taken).toEqual({ problems: true });
    await useEmptyStateSeen.persist.rehydrate();
    const again = dom.render(<RegionEmptyState region="problems" />);
    expect(again.container.querySelectorAll('button').length).toBe(0);
    expect(again.container.textContent).toContain(dom.t('u3Learn.empty.problems.title'));
    again.unmount();
    // another region is still new
    const other = dom.render(<RegionEmptyState region="watch" />);
    expect(other.container.querySelectorAll('button').length).toBe(1);
  });
});
