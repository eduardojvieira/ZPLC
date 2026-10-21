import { describe, expect, it } from 'bun:test';
import { useState } from 'react';
import { isFocused, setupDom } from '../test/dom';
import { TabList, TabPanel, type TabSpec } from './index';

const dom = await setupDom();

const TABS: TabSpec[] = [
  { id: 'output', label: 'Output' },
  { id: 'problems', label: 'Problems', badge: 3 },
  { id: 'gone', label: 'Unavailable', disabled: true },
  { id: 'tests', label: 'Tests' },
];

function Harness({ activation = 'automatic' }: { activation?: 'automatic' | 'manual' }) {
  const [value, setValue] = useState('output');
  return (
    <>
      <TabList label="Console" tabs={TABS} value={value} onValueChange={setValue} idPrefix="c" activation={activation} />
      {TABS.map((tab) => (
        <TabPanel key={tab.id} id={tab.id} idPrefix="c" selected={value === tab.id}>
          {tab.label} panel
        </TabPanel>
      ))}
    </>
  );
}

describe('Tabs (UX-001) in a DOM', () => {
  it('is a named tab list whose selected tab owns the visible panel', () => {
    dom.render(<Harness />);
    expect(dom.screen.getByRole('tablist', { name: 'Console' })).toBeTruthy();
    expect(dom.screen.getByRole('tab', { name: 'Output' }).getAttribute('aria-selected')).toBe('true');
    expect(dom.screen.getByRole('tab', { name: /Problems/ }).getAttribute('aria-selected')).toBe('false');
    expect(dom.screen.getByRole('tabpanel').textContent).toBe('Output panel');
  });

  it('a click selects a tab and shows its panel', async () => {
    const { user } = dom.render(<Harness />);
    await user.click(dom.screen.getByRole('tab', { name: /Problems/ }));
    expect(dom.screen.getByRole('tab', { name: /Problems/ }).getAttribute('aria-selected')).toBe('true');
    expect(dom.screen.getByRole('tabpanel').textContent).toBe('Problems panel');
    expect(dom.screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(dom.screen.getByRole('tab', { name: /Problems/ }).id);
  });

  it('only the selected tab is in the tab order; arrows move, skip the disabled tab and select', async () => {
    const { user } = dom.render(<Harness />);
    expect(dom.screen.getAllByRole('tab').map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1]);
    await user.tab();
    expect(isFocused(dom.screen.getByRole('tab', { name: 'Output' }))).toBe(true);
    await user.keyboard('{ArrowRight}');
    expect(dom.screen.getByRole('tab', { name: /Problems/ }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowRight}');
    expect(dom.screen.getByRole('tab', { name: 'Tests' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Home}');
    expect(dom.screen.getByRole('tab', { name: 'Output' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{End}');
    expect(dom.screen.getByRole('tab', { name: 'Tests' }).getAttribute('aria-selected')).toBe('true');
  });

  it('a disabled tab cannot be chosen', async () => {
    const { user } = dom.render(<Harness />);
    await user.click(dom.screen.getByRole('tab', { name: 'Unavailable' }));
    expect(dom.screen.getByRole('tab', { name: 'Output' }).getAttribute('aria-selected')).toBe('true');
  });

  it('with manual activation the arrows move focus and Enter selects', async () => {
    const { user } = dom.render(<Harness activation="manual" />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(isFocused(dom.screen.getByRole('tab', { name: /Problems/ }))).toBe(true);
    expect(dom.screen.getByRole('tab', { name: 'Output' }).getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{Enter}');
    expect(dom.screen.getByRole('tab', { name: /Problems/ }).getAttribute('aria-selected')).toBe('true');
  });
});
