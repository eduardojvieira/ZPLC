import { describe, expect, it } from 'bun:test';

import { checkKit, checkRepository, isGuarded, ratchetOffenders, violationsOf, type Offender, type Rule } from './ui-kit-guard';

const at = (name: string): string => `packages/zplc-ide/src/components/${name}.tsx`;
const rulesOf = (text: string, path = at('Sample')): Rule[] => violationsOf({ path, text }).map((violation) => violation.rule);

describe('kit guard: what breaks the kit rules (UX-002)', () => {
  it('finds a raw button, input, select and textarea', () => {
    expect(rulesOf('export const A = () => <div><button type="button">Go</button><input aria-label="n" /><select aria-label="s" /><textarea aria-label="t" /></div>'))
      .toEqual(['raw-button', 'raw-input', 'raw-select', 'raw-textarea']);
  });

  it('finds a title tooltip on an element, but not an svg title, a component prop or the kit', () => {
    expect(rulesOf('const A = () => <span title="Save">x</span>')).toEqual(['title-attribute']);
    expect(rulesOf('const A = () => <svg><title>Chart</title></svg>')).toEqual([]);
    expect(rulesOf('const A = () => <Modal title="Settings">x</Modal>')).toEqual([]);
  });

  it('finds the native confirm, alert and prompt, called bare or on window', () => {
    expect(rulesOf('const a = () => { confirm("Sure?"); window.alert("x"); globalThis.prompt("y"); }')).toEqual(['native-dialog', 'native-dialog', 'native-dialog']);
    expect(rulesOf('const a = () => { dialog.confirm("Sure?"); }')).toEqual([]);
  });

  it('exempts the kit itself, tests and generated stylesheets', () => {
    expect(isGuarded('packages/zplc-ide/src/ui/Button.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/ui/gallery/Specimens.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/components/A.test.tsx')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/theme/tokens.generated.css')).toBe(false);
    expect(isGuarded('packages/zplc-ide/src/components/A.tsx')).toBe(true);
    expect(isGuarded('packages/zplc-ide/src/index.css')).toBe(true);
  });
});

describe('kit guard: focus and text size (UX-005, UX-006)', () => {
  it('finds a focus utility that removes or replaces the one focus indicator', () => {
    expect(rulesOf('const c = "p-1 focus:outline-none focus:ring-2"')).toEqual(['focus-override']);
    expect(rulesOf('const c = "focus-visible:outline-2 focus-visible:outline-[var(--x)]"')).toEqual(['focus-override']);
    expect(rulesOf('const c = "outline-none"')).toEqual(['focus-override']);
    expect(rulesOf('const c = "hover:bg-[var(--x)] disabled:opacity-50"')).toEqual([]);
  });

  it('finds text under 11 pixels in a class, a style and a stylesheet, and passes 11', () => {
    expect(rulesOf('const c = "text-[10px] font-mono"')).toEqual(['small-text']);
    expect(rulesOf('const s = { fontSize: 9 }')).toEqual(['small-text']);
    expect(rulesOf('const c = "text-[11px]"')).toEqual([]);
    expect(violationsOf({ path: 'packages/zplc-ide/src/index.css', text: '.a { font-size: 10px; }\n.b { font-size: 11px; }' }).map((v) => [v.rule, v.line])).toEqual([['small-text', 1]]);
  });
});

describe('kit guard: names (UX-026)', () => {
  it('finds a form control with no label, and accepts every way to associate one', () => {
    expect(rulesOf('const A = () => <input type="text" />')).toContain('unnamed-control');
    expect(rulesOf('const A = () => <input aria-label="Name" />')).not.toContain('unnamed-control');
    expect(rulesOf('const A = () => <label>Name <input /></label>')).not.toContain('unnamed-control');
    expect(rulesOf('const A = () => <><label htmlFor={id}>Name</label><input id={id} /></>')).not.toContain('unnamed-control');
    expect(rulesOf('const A = () => <input type="hidden" />')).not.toContain('unnamed-control');
  });

  it('finds a kit control with no label, unless it sits in a Field', () => {
    expect(rulesOf('const A = () => <TextField value="" />')).toEqual(['unnamed-control']);
    expect(rulesOf('const A = () => <TextField label="Name" />')).toEqual([]);
    expect(rulesOf('const A = () => <TextField aria-label="Name" />')).toEqual([]);
    expect(rulesOf('const A = () => <Field label="Name"><NumberField /></Field>')).toEqual([]);
    expect(rulesOf('const A = () => <Switch checked />')).toEqual(['unnamed-control']);
    expect(rulesOf('const A = () => <IconButton icon={<X />} />')).toEqual(['unnamed-icon-button']);
  });

  it('finds an icon-only raw button with no name, and accepts text, an expression or an aria-label', () => {
    expect(rulesOf('const A = () => <button type="button"><X size={12} /></button>')).toEqual(['raw-button', 'unnamed-icon-button']);
    expect(rulesOf('const A = () => <button type="button" aria-label="Close"><X /></button>')).toEqual(['raw-button']);
    expect(rulesOf('const A = () => <button type="button"><X /><span>Close</span></button>')).toEqual(['raw-button']);
    expect(rulesOf('const A = () => <button type="button">{label}</button>')).toEqual(['raw-button']);
  });
});

describe('kit guard: the shrink-only list (UX-002)', () => {
  const entry = (rule: Rule, count: number): Offender => ({ file: at('Sample'), rule, count, requirement: 'UX-002', added: '2026-10-10', reason: 'not moved yet' });
  const sample = { path: at('Sample'), text: 'const A = () => <div><button type="button">A</button><button type="button">B</button></div>' };

  it('passes when the counts equal the entries', () => {
    expect(checkKit([sample], { offenders: [entry('raw-button', 2)] })).toEqual([]);
  });

  it('fails for a violation that is not listed, and for a listed count that grew', () => {
    expect(checkKit([sample], { offenders: [] })[0]).toContain('has 2 raw-button violations');
    expect(checkKit([sample], { offenders: [entry('raw-button', 1)] })[0]).toContain('grew from 1 to 2');
  });

  it('fails when a count shrank or an entry reached zero, so the list is lowered with the change', () => {
    expect(checkKit([sample], { offenders: [entry('raw-button', 3)] })[0]).toContain('lower the entry');
    expect(checkKit([sample], { offenders: [entry('raw-button', 2), entry('raw-input', 1)] })[0]).toContain('remove the entry');
  });

  it('ratchets down, never up', () => {
    expect(ratchetOffenders([sample], [entry('raw-button', 5), entry('raw-input', 1)])).toEqual([entry('raw-button', 2)]);
    expect(ratchetOffenders([sample], [entry('raw-button', 1)])).toEqual([entry('raw-button', 1)]);
  });

  it('holds for this repository: every violation is listed and nothing new is added', () => {
    expect(checkRepository()).toEqual([]);
  });
});
