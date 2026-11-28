import { describe, expect, test } from 'bun:test';

import { setupDom } from '../../src/test/dom';
import { clippersOf } from '../textFit';
import { CLOCK, STILL } from './capture';
import { collectMeasurement } from './measurement';

await setupDom();

describe('two captures of one build are the same picture (UXV-003)', () => {
  test('UXV-003 a generated React id is not part of the name of an element, a stable id is', () => {
    document.head.innerHTML = '<style>* { visibility: visible; opacity: 1; display: block; }</style>';
    document.body.innerHTML =
      '<main><div id="_r_2a6_-8"><span id="editor-tab-config:tasks">Tasks</span><b id="radix-:r4:">x</b></div></main>';
    // happy-dom has no layout: give every element a box so that it is measured
    const box = { x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, toJSON: () => ({}) };
    Element.prototype.getBoundingClientRect = () => box as DOMRect;
    const { elements } = collectMeasurement({ locale: 'en', focus: false }, clippersOf);
    const names = elements.map((element) => element.name).join('\n');
    expect(names).not.toContain('_r_');
    expect(names).not.toContain('radix');
    expect(names).toContain('span#editor-tab-config:tasks');
  });

  test('UXV-003 the page clock is fixed: Date.now() and new Date() give the same time on every call', async () => {
    const real = globalThis.Date;
    try {
      const run = (body: string) => new Function(`${CLOCK}; return ${body};`)() as number;
      const first = run('Date.now()');
      await Bun.sleep(5);
      expect(run('Date.now()')).toBe(first);
      expect(run('new Date().getTime()')).toBe(first);
      expect(run('new Date(5).getTime()')).toBe(5);
    } finally {
      globalThis.Date = real;
    }
  });

  test('UXV-003 the Monaco scrollbar and overview ruler, which fade on a timer, are fixed by the still style', () => {
    expect(STILL).toContain('.monaco-scrollable-element');
    expect(STILL).toContain('decorationsOverviewRuler');
  });
});
