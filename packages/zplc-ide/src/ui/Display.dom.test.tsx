import { describe, expect, it } from 'bun:test';
import { setupDom } from '../test/dom';
import { Badge, Button, EmptyState, ErrorState, LoadingState, PropertyList, SignalChip, SignalValue, Spinner, StatusDot } from './index';

const dom = await setupDom();

describe('Display components (UX-001) in a DOM', () => {
  it('a status dot names its tone for assistive technology even without a visible label', () => {
    dom.render(<StatusDot tone="success" label="Connected" />);
    expect(dom.screen.getByText('Connected').className).toContain('ui-visually-hidden');
    dom.render(<StatusDot tone="danger" label="Faulted" showLabel />);
    expect(dom.screen.getByText('Faulted').className).not.toContain('ui-visually-hidden');
  });

  it('a badge shows its text', () => {
    dom.render(<Badge tone="warning">Draft</Badge>);
    expect(dom.screen.getByText('Draft').getAttribute('data-tone')).toBe('warning');
  });

  it('a signal chip says its state in words and hides the glyph', () => {
    dom.render(<SignalChip tone="forced" />);
    const chip = document.querySelector('[data-signal="forced"]') as HTMLElement;
    expect(chip.textContent?.trim().length).toBeGreaterThan(1);
    expect(chip.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('a signal value spells out a forced or faulted state beside the value', () => {
    dom.render(<SignalValue tone="fault">42</SignalValue>);
    const value = document.querySelector('[data-signal="fault"]') as HTMLElement;
    expect(value.querySelector('.ui-visually-hidden')?.textContent?.length).toBeGreaterThan(0);
    expect(value.textContent).toContain('42');
  });

  it('a spinner is a status with a name', () => {
    dom.render(<Spinner label="Compiling" />);
    expect(dom.screen.getByRole('status').textContent).toBe('Compiling');
  });

  it('a loading state appears only after its delay', async () => {
    dom.render(<LoadingState label="Opening project" delayMs={30} />);
    expect(dom.screen.queryByRole('status')).toBeNull();
    await dom.waitFor(() => expect(dom.screen.getByRole('status').textContent).toBe('Opening project'));
  });

  it('an empty state is a heading with a description and a reachable action', async () => {
    const { user } = dom.render(<EmptyState title="No tasks yet" description="Add the first task" action={<Button>Add task</Button>} headingLevel={2} />);
    expect(dom.screen.getByRole('heading', { level: 2, name: 'No tasks yet' })).toBeTruthy();
    await user.tab();
    expect(document.activeElement?.textContent).toBe('Add task');
  });

  it('an error state is an alert with its message and a retry action', () => {
    dom.render(<ErrorState title="Build failed" message="Line 3: unexpected token" action={<Button>Try again</Button>} />);
    const alert = dom.screen.getByRole('alert');
    expect(alert.textContent).toContain('Line 3: unexpected token');
    expect(dom.screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('a property list pairs each term with its value', () => {
    dom.render(<PropertyList label="Task" items={[{ label: 'Interval', value: '10 ms' }, { label: 'Priority', value: 1 }]} />);
    const term = dom.screen.getByText('Interval');
    expect(term.tagName).toBe('DT');
    expect(term.nextElementSibling?.textContent).toBe('10 ms');
    expect(dom.screen.getByText('Priority').nextElementSibling?.textContent).toBe('1');
  });
});
