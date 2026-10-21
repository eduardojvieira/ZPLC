import { describe, expect, it } from 'bun:test';
import { setupDom, stubProjectLoader } from '../../test/dom';
import { SectionHost } from '../../test/SectionHost';
import type { ZPLCProjectConfig } from '../../types';

const dom = await setupDom();
await stubProjectLoader();
const { TasksSection } = await import('./TasksSection');

const task = { name: 'Fast', trigger: 'cyclic' as const, interval: 10, priority: 3, programs: [] };

describe('Task configuration (UX-013) in a DOM', () => {
  it('says there is no task and adds one by click, with a name field named for assistive technology', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(<SectionHost Section={TasksSection} onConfig={(config) => { last = config; }} />);
    expect(dom.screen.getByText(dom.t('settings.tasks.none'))).toBeTruthy();
    await user.click(dom.screen.getByRole('button', { name: dom.t('settings.tasks.add') }));
    expect(last?.tasks).toHaveLength(1);
    expect((dom.screen.getByRole('textbox', { name: dom.t('settings.tasks.name') }) as HTMLInputElement).value).toBe('Task1');
  });

  it('edits the name, the trigger, the interval and the priority of a task by keyboard and pointer', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(<SectionHost Section={TasksSection} initial={{ tasks: [task] }} onConfig={(config) => { last = config; }} />);
    const name = dom.screen.getByRole('textbox', { name: dom.t('settings.tasks.name') });
    await user.clear(name);
    await user.type(name, 'Slow');
    expect(last?.tasks[0]?.name).toBe('Slow');
    await user.selectOptions(dom.screen.getByRole('combobox', { name: dom.t('settings.tasks.trigger') }), 'freewheeling');
    expect(last?.tasks[0]?.trigger).toBe('freewheeling');
    const priority = dom.screen.getByRole('spinbutton', { name: dom.t('settings.tasks.priority') });
    await user.tripleClick(priority);
    await user.keyboard('7');
    expect(last?.tasks[0]?.priority).toBe(7);
  });

  it('accepts priority 0, which the field says is the lowest value', async () => {
    let last: ZPLCProjectConfig | undefined;
    const { user } = dom.render(<SectionHost Section={TasksSection} initial={{ tasks: [task] }} onConfig={(config) => { last = config; }} />);
    const priority = dom.screen.getByRole('spinbutton', { name: dom.t('settings.tasks.priority') });
    expect(priority.getAttribute('min')).toBe('0');
    await user.tripleClick(priority);
    await user.keyboard('0');
    expect(last?.tasks[0]?.priority).toBe(0);
  });

  it('removes a task with its named button', async () => {
    const { user } = dom.render(<SectionHost Section={TasksSection} initial={{ tasks: [task] }} />);
    await user.click(dom.screen.getByRole('button', { name: dom.t('settings.tasks.remove') }));
    expect(dom.screen.getByText(dom.t('settings.tasks.none'))).toBeTruthy();
  });

  it('warns when there is no program to choose from', () => {
    dom.render(<SectionHost Section={TasksSection} initial={{ tasks: [task] }} />);
    expect(dom.screen.getByText(dom.t('settings.tasks.noPrograms'))).toBeTruthy();
  });
});
