import { describe, expect, it } from 'bun:test';
import { auditMarkup, parseMarkup, textOf } from './audit';

const rules = (html: string): string[] => auditMarkup(html).map((problem) => problem.rule);

describe('structural accessibility audit of markup (UX-024, UX-026 stopgap)', () => {
  it('parses elements, attributes and text, and reads names from content', () => {
    const tree = parseMarkup('<div><button type="button" aria-label="Close">x</button><p>Hello &amp; <b>bye</b></p></div>');
    const [div] = tree.children;
    expect(typeof div).toBe('object');
    expect(textOf(tree)).toBe('xHello & bye');
  });

  it('reports a button with no text, no aria-label and no labelled-by', () => {
    expect(rules('<button type="button"><svg aria-hidden="true"></svg></button>')).toEqual(['control-without-name']);
    expect(rules('<button type="button" aria-label="Save"><svg aria-hidden="true"></svg></button>')).toEqual([]);
    expect(rules('<button type="button">Save</button>')).toEqual([]);
  });

  it('accepts a form control named by a label for it, a wrapping label, aria-label or aria-labelledby', () => {
    expect(rules('<label for="a">Name</label><input id="a" type="text"/>')).toEqual([]);
    expect(rules('<label>Name <input type="text"/></label>')).toEqual([]);
    expect(rules('<input type="text" aria-label="Name"/>')).toEqual([]);
    expect(rules('<span id="n">Name</span><input type="text" aria-labelledby="n"/>')).toEqual([]);
  });

  it('reports a form control with none of them, but not a hidden input', () => {
    expect(rules('<input type="text"/>')).toEqual(['control-without-name']);
    expect(rules('<label>Name</label><input id="a" type="text"/>')).toEqual(['control-without-name']);
    expect(rules('<select><option>a</option></select>')).toEqual(['control-without-name']);
    expect(rules('<input type="hidden" name="x"/>')).toEqual([]);
  });

  it('reports a duplicate id and a reference that points at nothing', () => {
    expect(rules('<p id="a">1</p><p id="a">2</p>')).toEqual(['duplicate-id']);
    expect(rules('<button type="button" aria-describedby="missing">Go</button>')).toEqual(['dangling-reference']);
    expect(rules('<label for="nope">Name</label>')).toEqual(['dangling-reference']);
  });

  it('reports a dialog, a tab list and a menu without a name, and a positive tabindex and a title attribute', () => {
    expect(rules('<div role="dialog"></div>')).toEqual(['control-without-name']);
    expect(rules('<div role="tablist"></div>')).toEqual(['control-without-name']);
    expect(rules('<div role="dialog" aria-label="Settings"></div>')).toEqual([]);
    expect(rules('<div tabindex="3">x</div>')).toEqual(['positive-tabindex']);
    expect(rules('<button type="button" title="Save">Save</button>')).toEqual(['title-attribute']);
  });
});
