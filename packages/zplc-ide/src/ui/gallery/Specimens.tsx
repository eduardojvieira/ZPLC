/**
 * One specimen of every kit component (UX-004), in the states a surface meets: default, disabled, invalid, selected,
 * with a hint. The overlays (dialog, menu, popover, tooltip) are shown as the static surface they draw, so a page of
 * specimens never steals focus or covers itself; their behaviour is covered by the kit's tests and journey.
 */
import { useId, useState } from 'react';
import { Inbox, Plus, Save, Trash2 } from 'lucide-react';
import { ICON_SIZES } from '../../theme/tokens';
import { SIGNAL_TONES } from '../../theme/signalTone';
import {
  Badge, Button, Checkbox, ContextMenu, DialogSurface, EmptyState, Field, IconButton, MenuButton, NumberField, Popover,
  PropertyList, Select, SignalChip, Spinner, StatusDot, Switch, TabList, TabPanel, TextField, Textarea, ToggleGroup, Toolbar, Tooltip,
} from '..';

const noop = (): void => undefined;

function Specimen({ name, children }: { name: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="ui-gallery-specimen" data-specimen={name}>
      <h3 id={id} className="ui-gallery-name">{name}</h3>
      <div className="ui-gallery-row">{children}</div>
    </section>
  );
}

export function Specimens() {
  const [tab, setTab] = useState('output');
  const [mode, setMode] = useState('compact');
  const [checked, setChecked] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const dialogTitle = useId();
  const dialogDescription = useId();
  const alertTitle = useId();
  const alertDescription = useId();
  const menu = [
    { id: 'compile', label: 'Compile', shortcut: 'Ctrl+B', onSelect: noop },
    { id: 'download', label: 'Compile and download', onSelect: noop, disabled: true },
    { id: 'settings', label: 'Project settings', onSelect: noop, separatorBefore: true },
  ];
  return (
    <div className="ui-gallery-specimens">
      <Specimen name="Button">
        <Button>Secondary</Button>
        <Button variant="primary" icon={<Save size={ICON_SIZES.md} />}>Save</Button>
        <Button variant="danger">Delete</Button>
        <Button variant="ghost">Ghost</Button>
        <Button size="sm">Small</Button>
        <Button disabled>Disabled</Button>
      </Specimen>
      <Specimen name="Icon button">
        <IconButton label="Add task" icon={<Plus size={ICON_SIZES.md} />} />
        <IconButton label="Remove task" icon={<Trash2 size={ICON_SIZES.md} />} variant="secondary" tooltip="Remove task (Delete)" />
        <IconButton label="Add variable" icon={<Plus size={ICON_SIZES.sm} />} size="sm" disabled />
      </Specimen>
      <Specimen name="Toggle group">
        <ToggleGroup
          label="Row density"
          value={mode}
          onValueChange={setMode}
          options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }, { value: 'disabled', label: 'Off', disabled: true }]}
        />
      </Specimen>
      <Specimen name="Field">
        <Field label="Task name" hint="Shown in the Watch table and the trace."><TextField defaultValue="MainTask" /></Field>
      </Specimen>
      <Specimen name="Text field">
        <TextField label="Broker address" placeholder="mqtt.example.com" />
        <TextField label="Client id" error="A client id is required." defaultValue="" />
        <TextField label="Disabled field" disabled defaultValue="Read only" />
      </Specimen>
      <Specimen name="Number field">
        <NumberField label="Interval (ms)" min={1} max={10000} defaultValue={100} hint="From 1 to 10000." />
        <NumberField label="Priority" min={0} max={9} defaultValue={11} error="The highest priority is 9." />
      </Specimen>
      <Specimen name="Textarea">
        <Textarea label="Description" rows={3} defaultValue="Runs the motor interlock every 100 ms." />
      </Specimen>
      <Specimen name="Select">
        <Select label="Trigger" defaultValue="cyclic"><option value="cyclic">Cyclic</option><option value="event">Event</option><option value="freewheeling">Freewheeling</option></Select>
        <Select label="Disabled select" disabled><option>None</option></Select>
      </Specimen>
      <Specimen name="Checkbox">
        <Checkbox label="Retain value" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        <Checkbox label="Disabled option" disabled />
        <Checkbox label="With a hint" hint="Applies after the next download." />
      </Specimen>
      <Specimen name="Switch">
        <Switch label="Check for updates" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
        <Switch label="Disabled switch" disabled />
      </Specimen>
      <Specimen name="Tabs">
        <div style={{ width: '100%' }}>
          <TabList
            label="Result panels"
            idPrefix="gallery"
            value={tab}
            onValueChange={setTab}
            tabs={[{ id: 'output', label: 'Output' }, { id: 'problems', label: 'Problems', badge: '2' }, { id: 'trace', label: 'Trace', disabled: true }]}
          />
          <TabPanel id="output" idPrefix="gallery" selected={tab === 'output'}>Build output appears here.</TabPanel>
          <TabPanel id="problems" idPrefix="gallery" selected={tab === 'problems'}>Two problems in Motor.st.</TabPanel>
        </div>
      </Specimen>
      <Specimen name="Toolbar">
        <Toolbar label="Project operations">
          <Button size="sm">Build</Button>
          <Button size="sm">Download</Button>
          <IconButton label="Save" icon={<Save size={ICON_SIZES.md} />} size="sm" />
        </Toolbar>
      </Specimen>
      <Specimen name="Menu">
        <MenuButton label="Build options" items={menu} />
        <div role="menu" aria-label="Build options (open)" className="ui-menu" style={{ position: 'static' }}>
          {menu.map((item, index) => (
            <div key={item.id} role="none">
              {item.separatorBefore && <div role="separator" className="ui-menu-separator" />}
              <button type="button" role="menuitem" tabIndex={-1} aria-disabled={item.disabled || undefined} data-active={index === 0 || undefined} className="ui-menu-item">
                <span>{item.label}</span>{item.shortcut && <kbd className="ui-menu-shortcut">{item.shortcut}</kbd>}
              </button>
            </div>
          ))}
        </div>
      </Specimen>
      <Specimen name="Context menu">
        <ContextMenu label="File actions" items={menu}><div className="ui-gallery-target" tabIndex={0}>Right-click or press Shift+F10</div></ContextMenu>
      </Specimen>
      <Specimen name="Popover">
        <Popover label="About the interval" trigger={<Button>Explain</Button>}><p>The interval is how often the task runs.</p></Popover>
        <div role="dialog" aria-label="About the interval (open)" className="ui-popover" style={{ position: 'static' }}><p>The interval is how often the task runs.</p></div>
      </Specimen>
      <Specimen name="Tooltip">
        <Tooltip content="Save the active file" shortcut="Ctrl+S"><Button>Hover or focus me</Button></Tooltip>
        <span role="tooltip" className="ui-tooltip" style={{ position: 'static' }}>Save the active file <kbd className="ui-tooltip-shortcut">Ctrl+S</kbd></span>
      </Specimen>
      <Specimen name="Dialog">
        <DialogSurface titleId={dialogTitle} descriptionId={dialogDescription} title="Recover unsaved changes" description="Studio did not close properly last time." size="sm" onClose={noop} footer={<><Button>Discard all</Button><Button variant="primary">Restore all</Button></>}>
          <p style={{ padding: '12px 16px', margin: 0 }}>Two files had changes that were not saved.</p>
        </DialogSurface>
      </Specimen>
      <Specimen name="Alert dialog">
        <DialogSurface role="alertdialog" titleId={alertTitle} descriptionId={alertDescription} title="Discard changes?" description="Three files have changes that are not saved." size="sm" footer={<><Button>Keep editing</Button><Button variant="danger">Discard changes</Button></>}>
          <p style={{ padding: '12px 16px', margin: 0 }}>Focus starts on Keep editing, so Enter never discards by accident.</p>
        </DialogSurface>
      </Specimen>
      <Specimen name="Badge">
        {(['neutral', 'info', 'success', 'warning', 'danger'] as const).map((tone) => <Badge key={tone} tone={tone}>{tone}</Badge>)}
      </Specimen>
      <Specimen name="Status dot">
        <StatusDot tone="success" label="Running" showLabel />
        <StatusDot tone="neutral" label="Stopped" showLabel />
        <StatusDot tone="warning" label="Forced" showLabel />
        <StatusDot tone="danger" label="Fault" showLabel />
      </Specimen>
      <Specimen name="Signal chip">
        {SIGNAL_TONES.map((tone) => <SignalChip key={tone} tone={tone} />)}
      </Specimen>
      <Specimen name="Spinner">
        <Spinner label="Building the project" />
      </Specimen>
      <Specimen name="Empty state">
        <EmptyState icon={<Inbox size={ICON_SIZES.lg} />} title="No tasks yet" description="Add a task to choose which program runs and how often." action={<Button variant="primary" icon={<Plus size={ICON_SIZES.md} />}>Add task</Button>} />
      </Specimen>
      <Specimen name="Property list">
        <PropertyList label="Controller" items={[{ label: 'Board', value: 'native_sim' }, { label: 'Program', value: 'Motor.zplc' }, { label: 'Tasks', value: '2' }]} />
      </Specimen>
    </div>
  );
}
