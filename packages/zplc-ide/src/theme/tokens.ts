/**
 * The design tokens of Studio, declared once (UX-003). Everything that is a colour, a size or a typeface of the
 * interface starts here, in three tiers:
 *
 *   1. ramps      raw colour values with no meaning: `--ramp-cobalt-700`. Only roles may name a ramp step.
 *   2. roles      the semantic palette every component reads, per theme: `--color-surface-800`, `--text-primary`,
 *                 `--color-accent-blue`, `--focus-ring-color`. A role says what a colour is for, not what it looks like.
 *   3. components what one component reads: `--button-bg`, `--input-border`, `--signal-true-fg`. They reference roles
 *                 (never a ramp) and so follow the theme without a rule of their own.
 *
 * Scales (radius, elevation, icon size, type, density) are theme-independent tokens of the third tier.
 *
 * `tokensCss.ts` renders this table to `tokens.generated.css`, `monaco-themes.ts` takes its editor colours from the
 * resolved roles, and `DESIGN.md` prints its token tables from it, so none of them can drift (tools/ci/ux-tokens.ts).
 * To change a colour change it here and run `bun tools/ci/ux-tokens.ts --write`.
 */
import { composite, contrastRatio, parseColor, type Rgba } from './color';

export type ThemeId = 'light' | 'dark' | 'high-contrast';
export const THEME_IDS: readonly ThemeId[] = ['light', 'dark', 'high-contrast'];
export type Tier = 'ramp' | 'role' | 'component' | 'scale';

export interface TokenDef {
  name: string;
  tier: Tier;
  /** The heading it is documented under. */
  group: string;
  doc: string;
  light: string;
  dark: string;
  'high-contrast': string;
  /** The value under the compact density; absent when density does not change it. */
  compact?: string;
}

const defs: TokenDef[] = [];

/** A ramp: named steps of one hue (or one neutral), theme independent. */
function ramp(family: string, doc: string, steps: Record<string, string>): void {
  for (const [step, value] of Object.entries(steps)) {
    defs.push({ name: `--ramp-${family}-${step}`, tier: 'ramp', group: `Ramp: ${family}`, doc: `${doc} (step ${step}).`, light: value, dark: value, 'high-contrast': value });
  }
}

/** A role: one value per theme. The dark value defaults to the light one, the high-contrast one to the dark one. */
function role(group: string, name: string, doc: string, light: string, dark: string = light, highContrast: string = dark): void {
  defs.push({ name, tier: 'role', group, doc, light, dark, 'high-contrast': highContrast });
}

/** A component or scale token that is the same in every theme, optionally with a compact-density value. */
function token(tier: 'component' | 'scale', group: string, name: string, doc: string, value: string, compact?: string): void {
  defs.push({ name, tier, group, doc, light: value, dark: value, 'high-contrast': value, ...(compact !== undefined && { compact }) });
}
const component = (group: string, name: string, doc: string, value: string): void => token('component', group, name, doc, value);
const scale = (group: string, name: string, doc: string, value: string, compact?: string): void => token('scale', group, name, doc, value, compact);

// ---------------------------------------------------------------------------------------------------------------------
// Tier 1: ramps
// ---------------------------------------------------------------------------------------------------------------------
ramp('paper', 'Drawing Sheet neutral, from the page to the ink', { 50: '#ffffff', 100: '#f8faf7', 200: '#e7ece8', 300: '#d7dfda', 400: '#a8b5b0', 500: '#5f6d6b', 600: '#4c5a59', 800: '#273537', 900: '#172127' });
ramp('graphite', 'Commissioning Spine neutral, from the ink to the canvas', { 50: '#e5edeb', 100: '#d3ddda', 200: '#b7c4c0', 400: '#8e9e9a', 600: '#52666e', 700: '#34464d', 800: '#19262c', 900: '#141e23', 950: '#0f171b' });
ramp('pure', 'Neutral of the high-contrast theme, black to white', { 0: '#000000', 50: '#080808', 100: '#111111', 700: '#d7d7d7', 800: '#e5e5e5', 900: '#f2f2f2', 1000: '#ffffff' });
ramp('cobalt', 'Cobalt, the reference and selection hue', { 200: '#55c8ff', 300: '#5ba7df', 700: '#245d8f' });
ramp('green', 'Confirmed green, TRUE and RUN only', { 200: '#7dff9a', 300: '#65c98e', 700: '#177344' });
ramp('amber', 'Amber, forced values and warnings', { 200: '#ffe16b', 300: '#e0ae4f', 700: '#8a5800' });
ramp('red', 'Fault red', { 200: '#ff9393', 300: '#ed7070', 700: '#a33838' });
ramp('violet', 'Violet, types and labels in code', { 200: '#d0b8ff', 300: '#b9a8ef', 700: '#635b95' });
ramp('teal', 'Teal, numbers and literals in code', { 200: '#5ff5e0', 300: '#4fc1b3', 700: '#1c6b66' });

const r = (family: string, step: string | number): string => `var(--ramp-${family}-${step})`;

// ---------------------------------------------------------------------------------------------------------------------
// Tier 2: roles
// ---------------------------------------------------------------------------------------------------------------------
const SURFACE = 'Surface';
role(SURFACE, '--color-surface-900', 'Application canvas: the window behind every region and the visual-editor canvas.', r('paper', 200), r('graphite', 950), r('pure', 0));
role(SURFACE, '--color-surface-800', 'Panel: sidebars, the code editor, the inspector and the result panels.', r('paper', 100), r('graphite', 900), r('pure', 50));
role(SURFACE, '--color-surface-700', 'Raised surface: nodes, inputs, cards and controls sitting on a panel.', r('paper', 50), r('graphite', 800), r('pure', 100));
role(SURFACE, '--color-surface-600', 'Rule and separator fill; the border colour of the high-contrast theme.', r('paper', 300), r('graphite', 700), r('pure', 1000));
role(SURFACE, '--color-surface-500', 'Strong rule, scrollbar thumb and the quiet side of a border.', r('paper', 400), r('graphite', 600), r('pure', 700));
role(SURFACE, '--color-surface-400', 'Quiet ink: tertiary text, wires and the stopped state.', r('paper', 500), r('graphite', 400), r('pure', 800));
role(SURFACE, '--color-surface-300', 'Secondary ink.', r('paper', 600), r('graphite', 200), r('pure', 900));
role(SURFACE, '--color-surface-200', 'Strong ink for emphasis on a panel.', r('paper', 800), r('graphite', 100), r('pure', 1000));
role(SURFACE, '--color-surface-100', 'Primary ink.', r('paper', 900), r('graphite', 50), r('pure', 1000));

const ACCENT = 'Accent';
role(ACCENT, '--color-accent-blue', 'Cobalt: selection, focus, an active reference and connected technical navigation. Never a success colour.', r('cobalt', 700), r('cobalt', 300), r('cobalt', 200));
role(ACCENT, '--color-accent-cyan', 'Alias of cobalt kept for components that name it.', 'var(--color-accent-blue)');
role(ACCENT, '--color-accent-green', 'Confirmed green: a TRUE value, RUN, a pass. Nothing else.', r('green', 700), r('green', 300), r('green', 200));
role(ACCENT, '--color-accent-yellow', 'Amber: a forced value, a warning, attention.', r('amber', 700), r('amber', 300), r('amber', 200));
role(ACCENT, '--color-accent-orange', 'Alias of amber kept for components that name it.', 'var(--color-accent-yellow)');
role(ACCENT, '--color-accent-red', 'Fault red: an error, a fault, a destructive action. Never FALSE.', r('red', 700), r('red', 300), r('red', 200));
role(ACCENT, '--color-accent-purple', 'Violet: a type or a label that is neither state nor selection.', r('violet', 700), r('violet', 300), r('violet', 200));
role(ACCENT, '--color-on-accent', 'Text and icons on a solid accent fill: white on the light accents, the canvas colour on the dark ones.', '#ffffff', r('graphite', 950), r('pure', 0));

const STATUS = 'Status';
role(STATUS, '--color-status-running', 'The runtime is running.', 'var(--color-accent-green)');
role(STATUS, '--color-status-stopped', 'The runtime is stopped or idle: neutral.', 'var(--color-surface-400)');
role(STATUS, '--color-status-warning', 'A warning needs attention.', 'var(--color-accent-orange)');
role(STATUS, '--color-status-connected', 'A connection is established.', 'var(--color-accent-blue)');
role(STATUS, '--color-status-disconnected', 'No connection: neutral.', 'var(--color-surface-400)');

const TEXT = 'Text and border';
role(TEXT, '--text-primary', 'Body text and values.', 'var(--color-surface-100)', 'var(--color-surface-100)', r('pure', 1000));
role(TEXT, '--text-secondary', 'Labels and supporting text.', 'var(--color-surface-300)', 'var(--color-surface-300)', r('pure', 900));
role(TEXT, '--text-tertiary', 'Hints, units and captions.', 'var(--color-surface-400)', 'var(--color-surface-400)', r('pure', 800));
role(TEXT, '--text-muted', 'De-emphasised text that is still readable.', 'var(--color-surface-400)', 'var(--color-surface-400)', r('pure', 700));
role(TEXT, '--border-color', 'The default 1px rule between regions and around controls.', 'var(--color-surface-600)', 'var(--color-surface-600)', r('pure', 1000));
role(TEXT, '--color-scrim', 'The veil behind a modal dialog.', 'rgb(23 33 39 / 0.5)', 'rgb(0 0 0 / 0.6)', 'rgb(0 0 0 / 0.8)');

const ELEVATION_ROLES = 'Elevation';
role(ELEVATION_ROLES, '--shadow-sm', 'Shadow of a small transient overlay (a tooltip). Surfaces are flat at rest.', '0 1px 2px rgb(23 33 39 / 0.08)', '0 1px 2px rgb(0 0 0 / 0.3)', 'none');
role(ELEVATION_ROLES, '--shadow-md', 'Shadow of a transient overlay (a dialog, a menu, a popover). The high-contrast theme draws a border instead.', '0 8px 20px rgb(23 33 39 / 0.14)', '0 8px 20px rgb(0 0 0 / 0.42)', 'none');

const VISUAL = 'Visual editors';
role(VISUAL, '--visual-canvas', 'Canvas of the Ladder, FBD and SFC editors.', 'var(--color-surface-900)');
role(VISUAL, '--visual-panel', 'Toolbox and control panels of the visual editors.', 'var(--color-surface-800)');
role(VISUAL, '--visual-node', 'Fill of a node, a rung element or a step.', 'var(--color-surface-700)');
role(VISUAL, '--visual-muted', 'Secondary labels on the canvas.', 'var(--color-surface-400)');
role(VISUAL, '--visual-wire', 'An idle wire or connection: neutral, never a state.', 'var(--color-surface-400)', 'var(--color-surface-500)', 'var(--color-surface-400)');

const FOCUS = 'Focus and separators';
role(FOCUS, '--focus-ring-color', 'The one focus indicator (UX-005); the operating system supplies it in forced-colors mode.', 'var(--color-accent-blue)');
role(FOCUS, '--focus-ring-width', 'Thickness of the focus indicator; thicker in the high-contrast theme.', '2px', '2px', '3px');
role(FOCUS, '--focus-ring-offset', 'Gap between a control and its focus indicator.', '2px');
role(FOCUS, '--separator-rule', 'The 1px rule drawn inside a resize handle at rest.', 'var(--color-surface-400)');

const EDITOR = 'Code editor';
role(EDITOR, '--editor-bg', 'Background of the code editor and its gutter.', 'var(--color-surface-800)');
role(EDITOR, '--editor-fg', 'Default text of the code editor.', 'var(--color-surface-100)', 'var(--color-surface-100)', r('pure', 1000));
role(EDITOR, '--editor-selection-bg', 'The selection of the active code editor.', 'color-mix(in srgb, var(--color-accent-blue) 28%, transparent)', 'color-mix(in srgb, var(--color-accent-blue) 32%, transparent)', 'color-mix(in srgb, var(--color-accent-blue) 55%, transparent)');
role(EDITOR, '--editor-inactive-selection-bg', 'The selection of a code editor that does not have focus.', 'color-mix(in srgb, var(--color-surface-400) 22%, transparent)');
role(EDITOR, '--editor-line-number', 'Line numbers in the gutter.', 'var(--color-surface-400)');
role(EDITOR, '--editor-line-number-active', 'The line number of the cursor line.', 'var(--color-surface-100)');
role(EDITOR, '--editor-cursor', 'The text cursor.', 'var(--color-surface-100)');
role(EDITOR, '--editor-line-highlight', 'The background of the cursor line.', 'color-mix(in srgb, var(--color-surface-400) 12%, transparent)');
role(EDITOR, '--syntax-comment', 'Comments, set in italic.', 'var(--text-tertiary)');
role(EDITOR, '--syntax-keyword', 'Keywords and control structures (bold).', 'var(--color-accent-blue)');
role(EDITOR, '--syntax-type', 'Data types such as INT, REAL and TIME.', r('teal', 700), r('teal', 300), r('teal', 200));
role(EDITOR, '--syntax-number', 'Numeric and time literals.', 'var(--color-accent-yellow)');
role(EDITOR, '--syntax-string', 'String literals.', 'var(--color-accent-purple)');
role(EDITOR, '--syntax-address', 'Direct addresses (%I, %Q, %M) and predefined variables (bold).', 'var(--color-accent-yellow)');
role(EDITOR, '--syntax-label', 'IL labels and jump targets (bold).', 'var(--color-accent-purple)');
role(EDITOR, '--syntax-operator', 'Operators and delimiters.', 'var(--text-secondary)');
role(EDITOR, '--syntax-bracket', 'Brackets and parentheses.', 'var(--text-primary)');

const DEBUG = 'Debugging in the code editor';
role(DEBUG, '--debug-breakpoint', 'Fill of a breakpoint dot in the editor margin. Red stays the breakpoint colour; the signal vocabulary reserves red for faults, which is an open question for the owner (see DESIGN.md).', 'var(--color-accent-red)');
role(DEBUG, '--debug-breakpoint-edge', 'Ring around a breakpoint dot: toward the text colour, so the dot keeps its outline on either margin.', 'color-mix(in srgb, var(--debug-breakpoint) 65%, var(--text-primary))');
role(DEBUG, '--debug-breakpoint-line', 'Tint of the line a breakpoint is on.', 'color-mix(in srgb, var(--color-accent-red) 15%, transparent)');
role(DEBUG, '--debug-line-bg', 'Background of the line execution is paused on.', 'color-mix(in srgb, var(--color-accent-red) 16%, transparent)');
role(DEBUG, '--debug-line-edge', 'Left edge and arrow of the line execution is paused on.', 'var(--color-accent-red)');

// ---------------------------------------------------------------------------------------------------------------------
// Tier 3: components
// ---------------------------------------------------------------------------------------------------------------------
const BUTTON = 'Button';
component(BUTTON, '--button-bg', 'Fill of a secondary button.', 'var(--color-surface-700)');
component(BUTTON, '--button-fg', 'Label of a secondary button.', 'var(--text-primary)');
component(BUTTON, '--button-border', 'Border of a secondary button.', 'var(--color-surface-400)');
component(BUTTON, '--button-bg-hover', 'Fill of a secondary button under the pointer.', 'color-mix(in srgb, var(--text-primary) 12%, var(--button-bg))');
component(BUTTON, '--button-bg-active', 'Fill of a secondary button while pressed.', 'color-mix(in srgb, var(--text-primary) 20%, var(--button-bg))');
component(BUTTON, '--button-primary-bg', 'Fill of the primary action of a surface.', 'var(--color-accent-blue)');
component(BUTTON, '--button-primary-fg', 'Label of a primary button.', 'var(--color-on-accent)');
component(BUTTON, '--button-primary-bg-hover', 'Fill of a primary button under the pointer: nearer to the text colour, so the label keeps its contrast.', 'color-mix(in srgb, var(--color-accent-blue) 85%, var(--text-primary))');
component(BUTTON, '--button-danger-bg', 'Fill of a destructive action.', 'var(--color-accent-red)');
component(BUTTON, '--button-danger-fg', 'Label of a destructive button.', 'var(--color-on-accent)');
component(BUTTON, '--button-danger-bg-hover', 'Fill of a destructive button under the pointer.', 'color-mix(in srgb, var(--color-accent-red) 85%, var(--text-primary))');
component(BUTTON, '--button-ghost-fg', 'Label or icon of a button with no fill.', 'var(--text-secondary)');
component(BUTTON, '--button-ghost-bg-hover', 'Fill of a button with no fill under the pointer.', 'color-mix(in srgb, var(--text-primary) 12%, transparent)');
component(BUTTON, '--button-disabled-opacity', 'Opacity of a disabled control.', '0.5');

const FIELD = 'Field';
component(FIELD, '--input-bg', 'Fill of a text, number or select field.', 'var(--color-surface-700)');
component(FIELD, '--input-fg', 'Text of a field.', 'var(--text-primary)');
component(FIELD, '--input-border', 'Border of a field; 3:1 against the panel it sits on.', 'var(--color-surface-400)');
component(FIELD, '--input-border-hover', 'Border of a field under the pointer.', 'var(--text-secondary)');
component(FIELD, '--input-placeholder', 'Placeholder text.', 'var(--text-tertiary)');
component(FIELD, '--input-invalid', 'Border and message of a field with an error.', 'var(--color-accent-red)');
component(FIELD, '--label-fg', 'The label of a field.', 'var(--text-secondary)');
component(FIELD, '--hint-fg', 'The hint under a field.', 'var(--text-tertiary)');
component(FIELD, '--check-border', 'Border of an unchecked checkbox or switch.', 'var(--color-surface-400)');
component(FIELD, '--check-bg-checked', 'Fill of a checked checkbox or switch.', 'var(--color-accent-blue)');
component(FIELD, '--check-fg-checked', 'Mark on a checked checkbox or switch.', 'var(--color-on-accent)');

const TABS = 'Tabs and menus';
component(TABS, '--tab-fg', 'An unselected tab.', 'var(--text-secondary)');
component(TABS, '--tab-fg-selected', 'The selected tab.', 'var(--text-primary)');
component(TABS, '--tab-indicator', 'The rule under the selected tab.', 'var(--color-accent-blue)');
component(TABS, '--tab-bg-hover', 'A tab under the pointer.', 'color-mix(in srgb, var(--text-primary) 8%, transparent)');
component(TABS, '--menu-item-bg-active', 'The active item of a menu, listbox or tree.', 'color-mix(in srgb, var(--color-accent-blue) 22%, transparent)');
component(TABS, '--menu-item-bg-active-danger', 'The active item of a menu when the item is destructive: a red tint, so red text keeps its contrast.', 'color-mix(in srgb, var(--color-accent-red) 14%, transparent)');
component(TABS, '--menu-separator', 'A separator between groups of menu items.', 'var(--color-surface-500)');

const OVERLAY = 'Overlay';
component(OVERLAY, '--overlay-bg', 'Fill of a dialog, a menu and a popover.', 'var(--color-surface-800)');
component(OVERLAY, '--overlay-fg', 'Text on an overlay.', 'var(--text-primary)');
component(OVERLAY, '--overlay-border', 'Border of an overlay.', 'var(--color-surface-500)');
component(OVERLAY, '--tooltip-bg', 'Fill of a tooltip: the inverse of the panel.', 'var(--color-surface-100)');
component(OVERLAY, '--tooltip-fg', 'Text of a tooltip.', 'var(--color-surface-900)');

const TONE = 'Tone';
for (const [tone, accent] of [['info', 'blue'], ['success', 'green'], ['warning', 'yellow'], ['danger', 'red']] as const) {
  component(TONE, `--tone-${tone}-fg`, `Text and icon of a ${tone} badge or message.`, `var(--color-accent-${accent})`);
  component(TONE, `--tone-${tone}-bg`, `Fill of a ${tone} badge or message.`, `color-mix(in srgb, var(--color-accent-${accent}) 14%, transparent)`);
  component(TONE, `--tone-${tone}-border`, `Border of a ${tone} badge or message.`, `var(--color-accent-${accent})`);
}
component(TONE, '--tone-neutral-fg', 'Text and icon of a neutral badge or message.', 'var(--text-secondary)');
component(TONE, '--tone-neutral-bg', 'Fill of a neutral badge or message.', 'color-mix(in srgb, var(--color-surface-400) 14%, transparent)');
component(TONE, '--tone-neutral-border', 'Border of a neutral badge or message; 3:1 against the panel, so a FALSE chip keeps its outline.', 'var(--color-surface-400)');

const SIGNAL = 'Signal vocabulary';
component(SIGNAL, '--signal-true-fg', 'A confirmed TRUE value: green.', 'var(--tone-success-fg)');
component(SIGNAL, '--signal-true-bg', 'Chip fill of a TRUE value.', 'var(--tone-success-bg)');
component(SIGNAL, '--signal-true-border', 'Chip border of a TRUE value.', 'var(--tone-success-border)');
component(SIGNAL, '--signal-false-fg', 'A FALSE value: neutral, never red.', 'var(--tone-neutral-fg)');
component(SIGNAL, '--signal-false-bg', 'Chip fill of a FALSE value.', 'var(--tone-neutral-bg)');
component(SIGNAL, '--signal-false-border', 'Chip border of a FALSE value.', 'var(--tone-neutral-border)');
component(SIGNAL, '--signal-unknown-fg', 'A value that has not been read: neutral, and the border is dashed.', 'var(--tone-neutral-fg)');
component(SIGNAL, '--signal-unknown-bg', 'Chip fill of an unknown value.', 'transparent');
component(SIGNAL, '--signal-unknown-border', 'Chip border of an unknown value.', 'var(--tone-neutral-border)');
component(SIGNAL, '--signal-forced-fg', 'A forced value: amber.', 'var(--tone-warning-fg)');
component(SIGNAL, '--signal-forced-bg', 'Chip fill of a forced value.', 'var(--tone-warning-bg)');
component(SIGNAL, '--signal-forced-border', 'Chip border of a forced value.', 'var(--tone-warning-border)');
component(SIGNAL, '--signal-fault-fg', 'A fault: red, and only a fault.', 'var(--tone-danger-fg)');
component(SIGNAL, '--signal-fault-bg', 'Chip fill of a fault.', 'var(--tone-danger-bg)');
component(SIGNAL, '--signal-fault-border', 'Chip border of a fault.', 'var(--tone-danger-border)');
component(SIGNAL, '--signal-value-fg', 'A numeric or string value that is not a state: cobalt.', 'var(--tone-info-fg)');
component(SIGNAL, '--signal-value-bg', 'Chip fill of a plain value.', 'var(--tone-info-bg)');
component(SIGNAL, '--signal-value-border', 'Chip border of a plain value.', 'var(--tone-info-border)');

// ---------------------------------------------------------------------------------------------------------------------
// Scales (UX-006, UX-007, UX-008)
// ---------------------------------------------------------------------------------------------------------------------
const TYPE = 'Typography';
scale(TYPE, '--font-sans', 'The interface typeface: Inter, bundled, then the system face.', "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif");
scale(TYPE, '--font-mono', 'The code and value typeface: JetBrains Mono, bundled, then a system monospace.', "'JetBrains Mono', ui-monospace, 'Cascadia Mono', Consolas, 'Liberation Mono', Menlo, monospace");
scale(TYPE, '--font-size-caption', 'Smallest text: captions, units and badges. The floor of the scale is 11px (UX-006).', '11px');
scale(TYPE, '--font-size-label', 'Labels, table cells and compact controls.', '12px');
scale(TYPE, '--font-size-body', 'Body text and the default size of the interface.', '13px');
scale(TYPE, '--font-size-title', 'Panel and dialog titles.', '14px');
scale(TYPE, '--font-size-heading', 'Page headings.', '16px');
scale(TYPE, '--font-weight-normal', 'Regular weight.', '400');
scale(TYPE, '--font-weight-medium', 'Medium weight: labels and tabs.', '500');
scale(TYPE, '--font-weight-strong', 'Strong weight: titles and values that matter.', '600');
scale(TYPE, '--line-height-tight', 'Line height of controls and tables.', '1.3');
scale(TYPE, '--line-height-normal', 'Line height of running text.', '1.5');
scale(TYPE, '--letter-spacing-label', 'Tracking of an uppercase structural label.', '0.08em');

/** Icon sizes in pixels: the `--icon-size-*` tokens and the `size` of a lucide icon read the same numbers. */
export const ICON_SIZES = { sm: 12, md: 16, lg: 20 } as const;

const SHAPE = 'Shape, elevation and icons';
scale(SHAPE, '--radius-control', 'Corner radius of a button, a field and a tab.', '2px');
scale(SHAPE, '--radius-surface', 'Corner radius of a panel or a card: square.', '0px');
scale(SHAPE, '--radius-overlay', 'Corner radius of a dialog, a menu and a popover.', '4px');
scale(SHAPE, '--radius-round', 'Corner radius of a status dot.', '9999px');
scale(SHAPE, '--elevation-flat', 'Surfaces are flat at rest.', 'none');
scale(SHAPE, '--elevation-tooltip', 'The shadow of a tooltip, the only small overlay.', 'var(--shadow-sm)');
scale(SHAPE, '--elevation-overlay', 'The shadow of a dialog, a menu or a popover: transient surfaces only.', 'var(--shadow-md)');
scale(SHAPE, '--icon-size-sm', 'Icon inside a compact control or a badge.', `${ICON_SIZES.sm}px`);
scale(SHAPE, '--icon-size-md', 'Icon in a toolbar or a button.', `${ICON_SIZES.md}px`);
scale(SHAPE, '--icon-size-lg', 'Icon of an empty state or a dialog.', `${ICON_SIZES.lg}px`);
scale(SHAPE, '--status-dot-size', 'Diameter of a status dot.', '8px');

const LAYER = 'Layers and motion';
scale(LAYER, '--z-overlay', 'Dialogs and their scrim.', '50');
scale(LAYER, '--z-popover', 'Menus and popovers, above dialogs.', '60');
scale(LAYER, '--z-tooltip', 'Tooltips, above everything.', '70');
scale(LAYER, '--z-toast', 'Notifications.', '80');
scale(LAYER, '--motion-fast', 'Duration of a hover or state transition; reduced to nothing under reduced motion.', '120ms');

const DENSITY = 'Density';
scale(DENSITY, '--spacing', 'The base spacing unit that every spacing utility is a multiple of (UX-008).', '0.25rem', '0.1875rem');
scale(DENSITY, '--control-height', 'Height of a button, a field and a tab.', '32px', '26px');
scale(DENSITY, '--control-height-sm', 'Height of a compact control inside a row or a toolbar.', '26px', '22px');
scale(DENSITY, '--control-padding-x', 'Horizontal padding of a control.', '12px', '8px');
scale(DENSITY, '--row-height', 'Height of a list, tree or table row.', '30px', '24px');
scale(DENSITY, '--gap-control', 'Gap between related controls.', '8px', '6px');

export const TOKENS: readonly TokenDef[] = defs;
export const TOKEN_NAMES: ReadonlySet<string> = new Set(defs.map((def) => def.name));

// ---------------------------------------------------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------------------------------------------------
export type TokenMap = Record<string, string>;

/** The declared (unresolved) values of a theme. */
export function declaredTokens(theme: ThemeId, density: 'comfortable' | 'compact' = 'comfortable'): TokenMap {
  return Object.fromEntries(defs.map((def) => [def.name, density === 'compact' && def.compact !== undefined ? def.compact : def[theme]]));
}

/** Every token of a theme with each var() replaced by the value the cascade gives that theme. */
export function resolveTokens(theme: ThemeId, density: 'comfortable' | 'compact' = 'comfortable'): TokenMap {
  const declared = declaredTokens(theme, density);
  const resolve = (value: string, depth = 0): string => {
    if (depth > 12) throw new Error(`var() chain is too deep or cyclic: ${value}`);
    return value.replace(/var\((--[\w-]+)\)/g, (_match, name: string) => {
      const target = declared[name];
      if (target === undefined) throw new Error(`Undefined token ${name} in theme ${theme}`);
      return resolve(target, depth + 1);
    });
  };
  return Object.fromEntries(Object.entries(declared).map(([name, value]) => [name, resolve(value)]));
}

// ---------------------------------------------------------------------------------------------------------------------
// Contrast (UX-024)
// ---------------------------------------------------------------------------------------------------------------------
export interface ContrastPair {
  fg: string;
  bg: string;
  /** A translucent `bg` is laid over this token before measuring. */
  over?: string;
  /** 4.5 for text, 3 for a graphic that carries meaning (WCAG 2.2 AA). */
  min: 3 | 4.5;
  use: string;
}

const SURFACES = ['--color-surface-900', '--color-surface-800', '--color-surface-700'];
const text = (fgs: string[], bgs: string[], use: string): ContrastPair[] => fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min: 4.5 as const, use })));
const graphic = (fgs: string[], bgs: string[], use: string): ContrastPair[] => fgs.flatMap((fg) => bgs.map((bg) => ({ fg, bg, min: 3 as const, use })));
const SIGNAL_STATES = ['true', 'false', 'unknown', 'forced', 'fault', 'value'];

/**
 * The declared list of foreground and background pairs whose ratio CI computes from the tokens above in the light, dark and
 * high-contrast themes. Decoration (a rule between regions) and a disabled control are exempt (WCAG 1.4.3, 1.4.11).
 */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...text(['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted'], SURFACES, 'Body, label, hint and muted text on the canvas, a panel and a raised surface'),
  ...text(['--color-accent-blue', '--color-accent-green', '--color-accent-yellow', '--color-accent-red', '--color-accent-purple'], SURFACES, 'Accent text and icons on the canvas, a panel and a raised surface'),
  ...['--color-accent-blue', '--color-accent-green', '--color-accent-yellow', '--color-accent-red', '--color-accent-purple'].map((bg) => ({ fg: '--color-on-accent', bg, min: 4.5 as const, use: 'Text on a solid accent fill' })),
  ...['--button-primary-bg-hover', '--button-danger-bg-hover'].map((bg) => ({ fg: '--color-on-accent', bg, min: 4.5 as const, use: 'Label of a primary or destructive button under the pointer' })),
  { fg: '--button-fg', bg: '--button-bg', min: 4.5, use: 'Label of a secondary button' },
  { fg: '--button-fg', bg: '--button-bg-hover', min: 4.5, use: 'Label of a secondary button under the pointer' },
  { fg: '--button-fg', bg: '--button-bg-active', min: 4.5, use: 'Label of a secondary button while pressed' },
  { fg: '--button-ghost-fg', bg: '--color-surface-800', min: 4.5, use: 'Label or icon of a button with no fill' },
  { fg: '--button-ghost-fg', bg: '--button-ghost-bg-hover', over: '--color-surface-800', min: 4.5, use: 'Label of a button with no fill under the pointer' },
  { fg: '--input-fg', bg: '--input-bg', min: 4.5, use: 'Text in a field' },
  { fg: '--input-placeholder', bg: '--input-bg', min: 4.5, use: 'Placeholder text in a field' },
  { fg: '--label-fg', bg: '--color-surface-800', min: 4.5, use: 'Field label on a panel' },
  { fg: '--hint-fg', bg: '--color-surface-800', min: 4.5, use: 'Field hint on a panel' },
  { fg: '--input-invalid', bg: '--color-surface-800', min: 4.5, use: 'Validation message on a panel' },
  ...graphic(['--input-border', '--check-border'], ['--color-surface-800', '--color-surface-700'], 'Boundary of a field, a checkbox or a switch'),
  { fg: '--check-fg-checked', bg: '--check-bg-checked', min: 4.5, use: 'Mark on a checked box' },
  { fg: '--tab-fg', bg: '--color-surface-800', min: 4.5, use: 'An unselected tab' },
  { fg: '--tab-fg-selected', bg: '--color-surface-800', min: 4.5, use: 'The selected tab' },
  { fg: '--tab-fg', bg: '--tab-bg-hover', over: '--color-surface-800', min: 4.5, use: 'A tab under the pointer' },
  { fg: '--tab-indicator', bg: '--color-surface-800', min: 3, use: 'The rule under the selected tab' },
  { fg: '--overlay-fg', bg: '--overlay-bg', min: 4.5, use: 'Text of a dialog, a menu or a popover' },
  { fg: '--overlay-fg', bg: '--menu-item-bg-active', over: '--overlay-bg', min: 4.5, use: 'The active item of a menu' },
  { fg: '--color-accent-red', bg: '--menu-item-bg-active-danger', over: '--overlay-bg', min: 4.5, use: 'A destructive item of a menu when it is active' },
  { fg: '--color-accent-red', bg: '--overlay-bg', min: 4.5, use: 'A destructive item of a menu' },
  { fg: '--tooltip-fg', bg: '--tooltip-bg', min: 4.5, use: 'Text of a tooltip' },
  ...['info', 'success', 'warning', 'danger', 'neutral'].map((tone) => ({ fg: `--tone-${tone}-fg`, bg: `--tone-${tone}-bg`, over: '--color-surface-800', min: 4.5 as const, use: `A ${tone} badge on a panel` })),
  ...SIGNAL_STATES.flatMap((state) => [
    { fg: `--signal-${state}-fg`, bg: `--signal-${state}-bg`, over: '--color-surface-800', min: 4.5 as const, use: `A ${state} value in a chip, the Watch table and the status bar` },
    { fg: `--signal-${state}-border`, bg: '--color-surface-800', min: 3 as const, use: `Chip border of a ${state} value` },
  ]),
  { fg: '--visual-wire', bg: '--visual-canvas', min: 3, use: 'An idle wire on the visual editor canvas' },
  { fg: '--focus-ring-color', bg: '--color-surface-900', min: 3, use: 'The focus indicator on the canvas' },
  { fg: '--focus-ring-color', bg: '--color-surface-800', min: 3, use: 'The focus indicator on a panel' },
  { fg: '--focus-ring-color', bg: '--color-surface-700', min: 3, use: 'The focus indicator on a raised surface' },
  ...graphic(['--separator-rule'], ['--color-surface-900', '--color-surface-800'], 'The rule inside a resize handle'),
  ...text(['--editor-fg', '--editor-line-number-active'], ['--editor-bg'], 'Code and the active line number'),
  { fg: '--editor-line-number', bg: '--editor-bg', min: 4.5, use: 'Line numbers' },
  ...['--syntax-comment', '--syntax-keyword', '--syntax-type', '--syntax-number', '--syntax-string', '--syntax-address', '--syntax-label', '--syntax-operator', '--syntax-bracket']
    .map((fg) => ({ fg, bg: '--editor-bg', min: 4.5 as const, use: 'Syntax colour on the code editor background' })),
  { fg: '--editor-fg', bg: '--editor-selection-bg', over: '--editor-bg', min: 4.5, use: 'Selected code' },
  ...graphic(['--debug-breakpoint', '--debug-line-edge'], ['--editor-bg'], 'A breakpoint dot and the marker of the paused line in the editor margin'),
  { fg: '--editor-fg', bg: '--debug-line-bg', over: '--editor-bg', min: 4.5, use: 'Code on the line execution is paused on' },
];

export interface PairResult { pair: ContrastPair; ratio: number; ok: boolean }

function colourOf(tokens: TokenMap, name: string): Rgba {
  const value = tokens[name];
  if (value === undefined) throw new Error(`Undefined token ${name}`);
  return parseColor(value);
}

/** The ratio of every declared pair in one theme (and one density: the colours do not depend on it, the check is cheap). */
export function contrastResults(theme: ThemeId): PairResult[] {
  const tokens = resolveTokens(theme);
  return CONTRAST_PAIRS.map((pair) => {
    const back = pair.over ? composite(colourOf(tokens, pair.bg), colourOf(tokens, pair.over)) : colourOf(tokens, pair.bg);
    // A translucent backdrop is first composited over the opaque token it sits on.
    const ratio = contrastRatio(colourOf(tokens, pair.fg), back);
    return { pair, ratio, ok: ratio >= pair.min };
  });
}
