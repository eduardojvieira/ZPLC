import { describe, expect, it } from 'bun:test';
import { composite, contrastRatio, parseColor, toHex } from './color';

describe('colour parsing', () => {
  it('parses hex, rgb and rgba colours and transparent', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('#0f171b')).toEqual({ r: 15, g: 23, b: 27, a: 1 });
    expect(parseColor('rgb(23 33 39 / 0.08)')).toEqual({ r: 23, g: 33, b: 39, a: 0.08 });
    expect(parseColor('rgba(37, 99, 235, 0.12)')).toEqual({ r: 37, g: 99, b: 235, a: 0.12 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('refuses a system colour, whose value only the operating system knows', () => {
    expect(() => parseColor('Highlight')).toThrow();
  });

  it('reads color-mix with transparent as the colour at that opacity', () => {
    expect(parseColor('color-mix(in srgb, #5ba7df 14%, transparent)')).toEqual({ r: 91, g: 167, b: 223, a: 0.14 });
  });

  it('mixes two opaque colours by their percentages', () => {
    const mixed = parseColor('color-mix(in srgb, #000000 25%, #ffffff)');
    expect(Math.round(mixed.r)).toBe(191);
    expect(mixed.a).toBe(1);
  });

  it('formats an opaque colour as hex', () => {
    expect(toHex({ r: 91, g: 167, b: 223, a: 1 })).toBe('#5ba7df');
  });
});

describe('WCAG 2.2 contrast (UX-024)', () => {
  it('matches the reference ratios', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('is symmetric, so a pair does not depend on which side is the text', () => {
    expect(contrastRatio('#5ba7df', '#0f171b')).toBe(contrastRatio('#0f171b', '#5ba7df'));
  });

  it('reproduces the white-on-accent figures the design review reported for the dark theme', () => {
    expect(contrastRatio('#ffffff', '#5ba7df')).toBeCloseTo(2.61, 2);
    expect(contrastRatio('#ffffff', '#ed7070')).toBeCloseTo(2.94, 2);
  });

  it('composites a translucent colour over its backdrop before measuring', () => {
    expect(composite(parseColor('rgba(0, 0, 0, 0.5)'), parseColor('#ffffff'))).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(contrastRatio('rgba(0, 0, 0, 0.5)', '#ffffff')).toBeCloseTo(contrastRatio('#808080', '#ffffff'), 1);
  });
});
