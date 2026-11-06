import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LDRung } from '../../models/ld';
import type { ElementState } from '../../monitoring/elementStates';
import { loadLDFile } from '../../models/visualFileLoad';
import { box, coil, contact, ldFile, rungsFile, variable } from '../../transpiler/ldFunctionFixture';
import LDRungGrid from './LDRungGrid';

const rungOf = (...series: Array<Record<string, unknown>>): LDRung =>
  (rungsFile({}, [{ cols: series.length, grid: [series] }]).rungs as LDRung[])[0];
const state = (power: boolean | undefined, powerOut: boolean | undefined): ElementState => ({ power, powerOut, pins: {}, pinFlags: {} });

describe('LNG-028 LNG-006 a function box in a read-only rung', () => {
  const rung = rungOf(contact('c1', 'Start'), box('f1', 'ADD', ['Level', '3'], 'Sum'), coil('k1', 'Lamp'));

  it('draws the function, its operands in order and its output', () => {
    const markup = renderToStaticMarkup(<LDRungGrid rung={rung} readOnly />);
    expect(markup).toContain('data-ld-function="ADD"');
    expect(markup).toMatch(/data-ld-function-name="">ADD</);
    expect(markup).toMatch(/data-ld-operand="IN1"[^>]*>(<title>[^<]*<\/title>)?Level</);
    expect(markup).toMatch(/data-ld-operand="IN2"[^>]*>(<title>[^<]*<\/title>)?3</);
    expect(markup).toMatch(/data-ld-output=""[^>]*>(<title>[^<]*<\/title>)?Sum</);
  });

  it('draws an operand that is not bound yet as a dash, and a comparison with no output', () => {
    const markup = renderToStaticMarkup(<LDRungGrid rung={rungOf(box('f1', 'GT', ['', '100']))} readOnly />);
    expect(markup).toMatch(/data-ld-operand="IN1"[^>]*>(<title>[^<]*<\/title>)?—</);
    expect(markup).not.toContain('data-ld-output');
  });

  it('shows EN and ENO apart: a comparison that fails has power on its left wire and none on its right', () => {
    const wires = (powerOut: boolean | undefined) => {
      const at = new Map([['rung:' + rung.id + '/cell:0,1', state(true, powerOut)]]);
      const markup = renderToStaticMarkup(<LDRungGrid rung={rung} readOnly elementStates={at} />);
      const wire = (name: string) => new RegExp(`stroke="([^"]+)" stroke-width="(\\d)" data-wire="${name}"`).exec(markup)!.slice(1);
      return { en: wire('en'), eno: wire('eno'), powered: /data-ld-cell="0,1" data-powered="(\w+)"/.exec(markup)?.[1] };
    };
    const failing = wires(false);
    expect(failing.powered).toBe('true');
    expect(failing.en[1]).toBe('3');
    expect(failing.eno[1]).toBe('2');
    const passing = wires(true);
    expect(passing.eno[1]).toBe('3');
    // a state that was not read is not drawn as power
    expect(wires(undefined).eno[1]).toBe('2');
  });

  it('draws the rung of a file the Learn pages load (ld-figure and ld-try read a file through the loader)', () => {
    const file = ldFile(
      { local: [variable('Level', 'INT')], outputs: [variable('Lamp', 'BOOL')] },
      box('f1', 'GT', ['Level', '100']),
      coil('k1', 'Lamp'),
    );
    const loaded = loadLDFile('level.ld.json', JSON.stringify(file));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(renderToStaticMarkup(<LDRungGrid rung={loaded.model.rungs[0]} readOnly />)).toContain('data-ld-function="GT"');
  });
});

describe('LNG-028 LNG-006 live values in a function box', () => {
  const rung = rungOf(box('f1', 'ADD', ['Level', '3'], 'Sum'));
  const at = (pins: ElementState['pins']) =>
    new Map([['rung:' + rung.id + '/cell:0,0', { power: true, powerOut: true, pins, pinFlags: {} }]]);

  it('shows the value of a variable operand and of the output in place of its name, and a literal as typed', () => {
    const markup = renderToStaticMarkup(<LDRungGrid rung={rung} readOnly elementStates={at({ IN1: 12, OUT: 15 })} />);
    expect(markup).toMatch(/data-ld-operand="IN1"[^>]*><title>Level = 12<\/title>12</);
    expect(markup).toMatch(/data-ld-operand="IN2"[^>]*>(<title>[^<]*<\/title>)?3</);
    expect(markup).toMatch(/data-ld-output=""[^>]*><title>Sum = 15<\/title>15</);
  });

  it('shows a value that was not read as a question mark, never as zero, and the names when not monitoring', () => {
    expect(renderToStaticMarkup(<LDRungGrid rung={rung} readOnly elementStates={at({ IN1: undefined })} />)).toMatch(
      /Level = \?<\/title>\?</,
    );
    expect(renderToStaticMarkup(<LDRungGrid rung={rung} readOnly />)).toMatch(/data-ld-operand="IN1"[^>]*>(<title>[^<]*<\/title>)?Level</);
  });
});
