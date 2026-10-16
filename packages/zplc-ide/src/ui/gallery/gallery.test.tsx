import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import * as kit from '..';
import { auditMarkup } from '../audit';
import { SUPPORTING_COMPONENTS, UX_001_COMPONENTS } from '../registry';
import { renderScopesCss } from '../../theme/tokensCss';
import { Specimens } from './Specimens';

const markup = renderToStaticMarkup(<Specimens />);
const entries: Array<[string, string | null]> = Object.entries(UX_001_COMPONENTS);
const built = entries.filter((entry): entry is [string, string] => entry[1] !== null);

describe('the component gallery (UX-004)', () => {
  it('lists only components the kit exports, and names the ones UX-001 asks for that it does not have yet (stopgap)', () => {
    for (const [, exportName] of built) expect({ exportName, exported: exportName in kit }).toEqual({ exportName, exported: true });
    for (const exportName of SUPPORTING_COMPONENTS) expect({ exportName, exported: exportName in kit }).toEqual({ exportName, exported: true });
    const missing = entries.filter(([, exportName]) => exportName === null).map(([name]) => name);
    expect(missing).toEqual(['combo box', 'toast', 'tree', 'data grid']);
  });

  it('has a specimen for every component of the registry', () => {
    const specimens = [...markup.matchAll(/data-specimen="([^"]+)"/g)].map((match) => match[1].toLowerCase());
    const expected: Record<string, string> = {
      button: 'button', 'icon button': 'icon button', 'toggle group': 'toggle group', field: 'field', 'text field': 'text field', 'number field': 'number field',
      select: 'select', checkbox: 'checkbox', switch: 'switch', tabs: 'tabs', menu: 'menu', 'context menu': 'context menu', dialog: 'dialog',
      'alert dialog': 'alert dialog', popover: 'popover', tooltip: 'tooltip', toolbar: 'toolbar', badge: 'badge', 'status dot': 'status dot',
      'empty state': 'empty state', 'property list': 'property list',
    };
    for (const [name] of built) expect({ name, shown: specimens.includes(expected[name]) }).toEqual({ name, shown: true });
    for (const extra of ['textarea', 'range', 'signal chip', 'spinner']) expect(specimens).toContain(extra);
  });

  it('passes the structural accessibility audit: every control named, no duplicate id, no dangling reference', () => {
    expect(auditMarkup(markup)).toEqual([]);
  });

  it('shows every signal state with its own word', () => {
    for (const word of ['TRUE', 'FALSE', '---', 'FORCED', 'FAULT']) expect(markup).toContain(`>${word}<`);
  });

  it('scopes each of the three themes and both densities, re-declaring the component tokens a scope reads', () => {
    const css = renderScopesCss();
    for (const theme of ['light', 'dark', 'high-contrast']) expect(css).toContain(`[data-ui-theme="${theme}"]`);
    expect(css).toContain('[data-ui-density="compact"]');
    expect(css).toMatch(/\[data-ui-theme="dark"\] \{[^}]*--button-bg:/);
    expect(css).not.toMatch(/--ramp-[\w-]+:/);
  });
});
