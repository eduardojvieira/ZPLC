import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { setupDom, stubProjectLoader } from '../../test/dom';

const dom = await setupDom();
await stubProjectLoader();
const { SignalTable } = await import('./SignalTable');
const { createMapEditor } = await import('./mapEditor');
const { generateDeclarations } = await import('./declarations');
import type { PlantSignalDef } from '../contracts';
import type { IoMap } from '../../runtime/ioMap';

const tank: PlantSignalDef[] = [
  { name: 'Tank1.level', direction: 'sensor', type: 'REAL', unit: 'm', range: { min: 0, max: 1 } },
  { name: 'Tank1.fill', direction: 'command', type: 'REAL', unit: '%', range: { min: 0, max: 100 } },
  { name: 'Tank1.alarm', direction: 'sensor', type: 'BOOL' },
];
const raw = { raw_min: 0, raw_max: 27648, eng_min: 0, eng_max: 1, unit: 'm' };
const inp = (path: string, type: string) => ({ path, pou: 'Main', name: path.split('.')[1], type }) as unknown as IoMap['inputs'][number];
const io = (inputs: IoMap['inputs'] = []): IoMap => ({ outputs: [], inputs });
const level = (ed: ReturnType<typeof createMapEditor>, ioMap: IoMap) => ed.check(ioMap).filter((p) => p.path === 'signals.Tank1.level');

describe('numeric map editor', () => {
  it("SCN-012 a numeric signal binds with a raw range and the part's engineering range", () => {
    const ed = createMapEditor(tank, 's');
    expect(ed.bind('Tank1.level', 'Main.Level', raw, 'REAL')).toBeNull();
    expect(ed.map().signals['Tank1.level']).toEqual({ direction: 'sensor', type: 'REAL', point: 'Main.Level', range: raw });
    expect(level(ed, io([inp('Main.Level', 'REAL')]))).toEqual([]);
  });

  it('SCN-012 a numeric signal whose engineering range differs from the part is a located problem', () => {
    const ed = createMapEditor(tank, 's');
    ed.bind('Tank1.level', 'Main.Level', { ...raw, eng_max: 5, unit: 'ft' }, 'REAL');
    const text = level(ed, io([inp('Main.Level', 'REAL')])).map((p) => p.message);
    expect(text.some((m) => m.includes('eng_max') && m.includes('differs'))).toBe(true);
    expect(text.some((m) => m.includes('unit'))).toBe(true);
  });

  it('SCN-012 an INT map signal on a REAL part signal is valid when the program variable is INT', () => {
    const ed = createMapEditor(tank, 's');
    ed.bind('Tank1.level', 'Main.Level', raw, 'INT');
    expect(ed.map().signals['Tank1.level']?.type).toBe('INT');
    expect(level(ed, io([inp('Main.Level', 'INT')]))).toEqual([]);
  });

  it('SCN-012 a program variable of another type than the map is reported at the signal', () => {
    const ed = createMapEditor(tank, 's');
    ed.bind('Tank1.level', 'Main.Level', raw, 'INT');
    const [p] = level(ed, io([inp('Main.Level', 'REAL')]));
    expect(p.message).toContain('Main.Level is REAL, the signal is INT');
  });

  it('SCN-012 the BOOL path of M1 is unchanged', () => {
    const ed = createMapEditor(tank, 's');
    expect(ed.bind('Tank1.alarm', 'Main.Alarm', undefined, 'INT')).toBeNull();
    expect(ed.map().signals['Tank1.alarm']).toEqual({ direction: 'sensor', type: 'BOOL', point: 'Main.Alarm' });
    expect(ed.check(io([inp('Main.Alarm', 'BOOL')])).filter((p) => p.path === 'signals.Tank1.alarm')).toEqual([]);
    expect(ed.check(io([inp('Main.Alarm', 'INT')])).some((p) => p.message.includes('Main.Alarm is INT'))).toBe(true);
  });

  it('SCN-011 the signal list shows type, direction, unit and range', async () => {
    for (const [locale, command, unit, point] of [
      ['en', 'Command', 'Unit for Tank1.level', 'Program point for Tank1.level'],
      ['es', 'Orden', 'Unidad de Tank1.level', 'Punto del programa para Tank1.level'],
    ] as const) {
      const calls: unknown[][] = [];
      const { container, user } = dom.render(
        createElement(SignalTable, {
          signals: tank,
          bindings: {},
          problems: [],
          disabled: false,
          onBind: (...a: unknown[]) => calls.push(a),
          onUnbind() {},
        }),
        { locale },
      );
      expect(container.textContent).not.toContain('plantEditor.');
      expect(container.textContent).toContain(command);
      expect(container.textContent).toContain('REAL 0..1 m');
      const u = dom.within(container).getByLabelText(unit) as HTMLInputElement;
      expect([u.value, u.readOnly]).toEqual(['m', true]);
      await user.type(dom.within(container).getByLabelText(point), 'Main.Level');
      await user.click(dom.within(container).getAllByRole('button')[0]);
      expect(calls[0]?.slice(0, 2)).toEqual(['Tank1.level', 'Main.Level']);
      expect(calls[0]?.[2]).toEqual({ raw_min: 0, raw_max: 1000, eng_min: 0, eng_max: 1, unit: 'm' });
      expect(calls[0]?.[3]).toBe('REAL');
    }
  });

  it('SCN-013 a tank scene generates REAL and INT declarations with their unit', () => {
    const text = generateDeclarations(
      [...tank, { name: 'Tank1.count', direction: 'sensor', type: 'INT', unit: 'pcs', range: { min: 0, max: 9 } }],
      'st',
    );
    expect(text).toContain('Tank1_level : REAL; (* m *)');
    expect(text).toContain('Tank1_fill : REAL; (* % *)');
    expect(text).toContain('Tank1_count : INT; (* pcs *)');
    expect(text).toContain('Tank1_alarm : BOOL;');
  });
});
