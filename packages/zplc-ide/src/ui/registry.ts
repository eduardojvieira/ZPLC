/**
 * The components UX-001 names, and the kit export that provides each one (null when it is not built yet). The gallery
 * renders every non-null entry (UX-004) and a test holds both lists to the kit's actual exports, so this cannot claim a
 * component the kit does not have.
 */
export const UX_001_COMPONENTS = {
  button: 'Button',
  'icon button': 'IconButton',
  'toggle group': 'ToggleGroup',
  field: 'Field',
  'text field': 'TextField',
  'number field': 'NumberField',
  select: 'Select',
  'combo box': null,
  checkbox: 'Checkbox',
  switch: 'Switch',
  tabs: 'TabList',
  menu: 'MenuButton',
  'context menu': 'ContextMenu',
  dialog: 'Dialog',
  'alert dialog': 'AlertDialog',
  popover: 'Popover',
  tooltip: 'Tooltip',
  toast: null,
  tree: null,
  'data grid': null,
  toolbar: 'Toolbar',
  badge: 'Badge',
  'status dot': 'StatusDot',
  'empty state': 'EmptyState',
  'property list': 'PropertyList',
} as const satisfies Record<string, string | null>;

/** Beyond UX-001's list: the kit's own supporting components. */
export const SUPPORTING_COMPONENTS = ['Textarea', 'RangeField', 'FileInput', 'PointMenu', 'DialogSurface', 'SignalChip', 'Spinner', 'TabPanel'] as const;
