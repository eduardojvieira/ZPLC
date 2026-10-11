import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Plus } from 'lucide-react';
import { auditMarkup } from './audit';
import {
  AlertDialog, Badge, Button, Checkbox, Dialog, EmptyState, Field, IconButton, MenuButton, NumberField, PropertyList, Select,
  SignalChip, Spinner, StatusDot, Switch, TabList, TabPanel, TextField, Textarea, ToggleGroup, Tooltip,
} from './index';

const html = (node: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(node);
const noop = (): void => undefined;

describe('kit buttons (UX-001, UX-026)', () => {
  it('renders a button that does not submit a form, with its variant and size, named by its text', () => {
    const out = html(<Button variant="primary" size="sm">Save</Button>);
    expect(out).toContain('type="button"');
    expect(out).toContain('data-variant="primary"');
    expect(out).toContain('data-size="sm"');
    expect(out).toContain('>Save<');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('keeps a disabled button disabled and an icon out of its name', () => {
    const out = html(<Button disabled icon={<Plus />}>Add task</Button>);
    expect(out).toContain('disabled=""');
    expect(out).toContain('aria-hidden="true"');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('names an icon button by its required label and puts no title attribute on it', () => {
    const out = html(<IconButton label="Remove task" icon={<Plus />} />);
    expect(out).toContain('aria-label="Remove task"');
    expect(out).not.toContain('title=');
    expect(out).not.toContain('role="tooltip"');
    expect(auditMarkup(out)).toEqual([]);
  });
});

describe('kit form fields (UX-001, UX-026)', () => {
  it('associates the label with the control by for and id', () => {
    const out = html(<TextField label="Task name" defaultValue="Main" />);
    const id = /<input[^>]* id="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeDefined();
    expect(out).toContain(`<label for="${id}"`);
    expect(auditMarkup(out)).toEqual([]);
  });

  it('describes a control by its hint and its error, marks it invalid, and announces the error', () => {
    const out = html(<Field label="Interval (ms)" hint="Between 1 and 10000" error="Must be at least 1" required><NumberField defaultValue={0} /></Field>);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-required="true"');
    expect(out).toContain('role="alert"');
    const described = /aria-describedby="([^"]+)"/.exec(out)?.[1].split(' ') ?? [];
    expect(described).toHaveLength(2);
    for (const id of described) expect(out).toContain(`id="${id}"`);
    expect(auditMarkup(out)).toEqual([]);
  });

  it('keeps two fields of one page apart: their ids are unique', () => {
    const out = html(<><TextField label="Broker" /><TextField label="Port" /><Select label="QoS"><option>0</option></Select><Textarea label="Notes" /></>);
    expect(auditMarkup(out)).toEqual([]);
  });

  it('accepts an aria-label for a control whose label is elsewhere on the page', () => {
    expect(auditMarkup(html(<TextField aria-label="Search the tree" />))).toEqual([]);
  });

  it('shows what an unnamed control looks like to the audit, so the guard has something to catch', () => {
    expect(auditMarkup(html(<TextField />)).map((problem) => problem.rule)).toEqual(['control-without-name']);
  });

  it('renders a number field as a number input with tabular figures', () => {
    const out = html(<NumberField label="Priority" min={0} max={9} defaultValue={5} />);
    expect(out).toContain('type="number"');
    expect(out).toContain('ui-tabular');
    expect(out).toContain('min="0"');
  });

  it('renders a checkbox and a switch wrapped by their label, the switch with the switch role', () => {
    const box = html(<Checkbox label="Retain" defaultChecked />);
    expect(box).toContain('type="checkbox"');
    expect(box).toContain('checked=""');
    expect(box).toMatch(/^<label[^>]*>.*Retain/);
    const toggle = html(<Switch label="Check for updates" checked onChange={noop} />);
    expect(toggle).toContain('role="switch"');
    expect(auditMarkup(box + toggle)).toEqual([]);
  });
});

describe('kit tabs and toggle group (UX-001, UX-025)', () => {
  const tabs = [{ id: 'output', label: 'Output' }, { id: 'problems', label: 'Problems', badge: '3' }, { id: 'trace', label: 'Trace', disabled: true }];

  it('renders a tab list whose selected tab is the only one in the tab order', () => {
    const out = html(<TabList label="Panels" tabs={tabs} value="problems" onValueChange={noop} idPrefix="console" />);
    expect(out).toContain('role="tablist"');
    expect(out).toContain('aria-label="Panels"');
    expect(out).toMatch(/id="console-tab-problems"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(out).toMatch(/id="console-tab-output"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    expect(out).toContain('aria-controls="console-panel-problems"');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('puts the first enabled tab in the tab order when none is selected, never a disabled one', () => {
    const out = html(<TabList label="Panels" tabs={[{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }]} value="zzz" onValueChange={noop} idPrefix="p" />);
    expect(out).toMatch(/id="p-tab-b"[^>]*tabindex="0"/);
    expect(out).toMatch(/id="p-tab-a"[^>]*tabindex="-1"/);
  });

  it('renders only the selected panel, named by its tab', () => {
    const shown = html(<TabPanel id="problems" idPrefix="console" selected>Body</TabPanel>);
    expect(shown).toContain('role="tabpanel"');
    expect(shown).toContain('aria-labelledby="console-tab-problems"');
    expect(html(<TabPanel id="output" idPrefix="console" selected={false}>Body</TabPanel>)).toBe('');
  });

  it('renders a toggle group with aria-pressed on each button and one in the tab order', () => {
    const out = html(<ToggleGroup label="Density" value="compact" onValueChange={noop} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />);
    expect(out).toContain('role="group"');
    expect(out).toMatch(/aria-pressed="true"[^>]*tabindex="0"[^>]*>Compact/);
    expect(out).toMatch(/aria-pressed="false"[^>]*tabindex="-1"[^>]*>Comfortable/);
    expect(auditMarkup(out)).toEqual([]);
  });
});

describe('kit dialogs (UX-001, UX-025, UX-020)', () => {
  it('renders nothing while closed', () => {
    expect(html(<Dialog open={false} onClose={noop} title="Settings">x</Dialog>)).toBe('');
  });

  it('names the dialog by its title, describes it, and gives the close button a name', () => {
    const out = html(<Dialog open onClose={noop} title="Recover unsaved changes" description="Studio did not close properly.">Body</Dialog>);
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    const labelled = /aria-labelledby="([^"]+)"/.exec(out)?.[1];
    expect(out).toContain(`<h2 id="${labelled}"`);
    expect(out).toContain('aria-label="Close"');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('renders an alert dialog whose action button names the action and that has no close button', () => {
    const out = html(<AlertDialog open title="Discard changes?" description="Three files have changes that are not saved." actionLabel="Discard changes" cancelLabel="Keep editing" onAction={noop} onCancel={noop} destructive />);
    expect(out).toContain('role="alertdialog"');
    expect(out).toContain('>Discard changes</button>');
    expect(out).toContain('>Keep editing</button>');
    expect(out).toContain('data-variant="danger"');
    expect(out).not.toContain('aria-label="Close"');
    expect(auditMarkup(out)).toEqual([]);
  });
});

describe('kit menu and tooltip (UX-001)', () => {
  it('renders a menu button closed, with the menu popup attributes and no menu in the page', () => {
    const out = html(<MenuButton label="Build options" items={[{ id: 'compile', label: 'Compile', onSelect: noop }]} />);
    expect(out).toContain('aria-haspopup="menu"');
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain('role="menu"');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('renders a tooltip wrapper that shows nothing until hover or focus', () => {
    const out = html(<Tooltip content="Save (Ctrl+S)"><button type="button">Save</button></Tooltip>);
    expect(out).toContain('<button type="button">Save</button>');
    expect(out).not.toContain('role="tooltip"');
  });
});

describe('kit display components (UX-001, UX-009)', () => {
  it('gives a status dot a text, shown or read by a screen reader only', () => {
    const hidden = html(<StatusDot tone="success" label="Running" />);
    expect(hidden).toContain('ui-visually-hidden');
    expect(hidden).toContain('>Running<');
    expect(html(<StatusDot tone="danger" label="Fault" showLabel />)).not.toContain('ui-visually-hidden');
  });

  it('renders a badge with text and a tone', () => {
    expect(html(<Badge tone="warning">Simulation</Badge>)).toContain('data-tone="warning"');
  });

  it('renders a signal chip with the word and the glyph of its state, from the signal tokens', () => {
    const out = html(<SignalChip tone="forced" />);
    expect(out).toContain('data-signal="forced"');
    expect(out).toContain('FORCED');
    expect(out).toContain('◆');
    expect(out).toContain('--signal-forced-fg');
    expect(html(<SignalChip tone="unknown" />)).toContain('border-dashed');
  });

  it('renders an empty state with a heading and its next action', () => {
    const out = html(<EmptyState title="No tasks yet" description="Add a task to run a program." action={<Button>Add task</Button>} />);
    expect(out).toContain('<h3');
    expect(out).toContain('>Add task<');
    expect(auditMarkup(out)).toEqual([]);
  });

  it('renders a property list as a definition list, and a spinner that announces itself', () => {
    const out = html(<PropertyList items={[{ label: 'Board', value: 'native' }, { label: 'Tasks', value: '2' }]} />);
    expect(out).toContain('<dl');
    expect(out).toContain('<dt>Board</dt><dd>native</dd>');
    expect(html(<Spinner label="Building" />)).toContain('role="status"');
  });
});
