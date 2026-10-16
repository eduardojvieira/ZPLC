import { describe, expect, it } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { SerialPortDialog, type SerialPortDialogProps } from './SerialPortDialog';
import { boardNote, type SerialPortRow } from '../utils/serialPortChoice';

const row = (overrides: Partial<SerialPortRow> & { portId: string }): SerialPortRow => ({
  name: `Port ${overrides.portId}`, usbId: null, serialNumber: null, boards: [], ambiguous: false, vendor: null, kind: 'other', ...overrides,
});

const render = (props: Partial<SerialPortDialogProps> = {}) => renderToStaticMarkup(
  <SerialPortDialog rows={[]} selectedPortId={null} refreshing={false} onSelect={() => undefined} onChoose={() => undefined} onRefresh={() => undefined} onCancel={() => undefined} {...props} />,
);

describe('serial port dialog (IDE-018)', () => {
  it('lists each port with its name and USB identifiers, and marks a known board', () => {
    const html = render({
      rows: [
        row({ portId: 'a', name: 'Pico', usbId: '2E8A:000A', serialNumber: 'E661', boards: ['Raspberry Pi Pico (RP2040)'], kind: 'known-board', vendor: 'Raspberry Pi (Pico, RP2040)' }),
        row({ portId: 'b', name: 'ttyUSB0', usbId: '0403:6001', kind: 'known-vendor', vendor: 'FTDI' }),
        row({ portId: 'c', name: 'ttyS0' }),
      ],
    });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Choose a serial port');
    expect(html).toContain('>Pico<');
    expect(html).toContain('USB 2E8A:000A');
    expect(html).toContain('serial number E661');
    expect(html).toContain('Known board: Raspberry Pi Pico (RP2040)');
    expect(html).toContain('USB vendor: FTDI');
    expect(html).toContain('No USB identifiers');
    expect(html.match(/data-serial-port-row="known-board"/g)).toHaveLength(1);
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).not.toContain('<input');
  });

  it('is a radio group with one tab stop: the chosen port, or the first one when none is chosen', () => {
    const rows = [row({ portId: 'a' }), row({ portId: 'b' })];
    const none = render({ rows });
    expect(none).toContain('role="radiogroup"');
    const radios = (html: string) => html.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios(none).map((tag) => tag.includes('aria-checked="false"') && tag.includes('tabindex="0"'))).toEqual([true, false]);
    expect(radios(none).every((tag) => tag.includes('aria-checked="false"'))).toBe(true);
    const chosen = radios(render({ rows, selectedPortId: 'b' }));
    expect(chosen.map((tag) => tag.includes('aria-checked="true"'))).toEqual([false, true]);
    expect(chosen.map((tag) => tag.includes('tabindex="0"'))).toEqual([false, true]);
  });

  it('says so when two boards share the identifiers, instead of naming one of them', () => {
    const note = boardNote(row({ portId: 'a', boards: ['Raspberry Pi Pico (RP2040)', 'Waveshare RP2040-Zero'], ambiguous: true, kind: 'known-board' }));
    expect(note).toContain('Raspberry Pi Pico (RP2040) or Waveshare RP2040-Zero');
    expect(note).toContain('does not say which one');
  });

  it('can be refreshed and cancelled, offers a port only once one is selected, and says when there is no port', () => {
    const empty = render();
    expect(empty).toContain('No serial port was found');
    expect(empty).toContain('>Refresh<');
    expect(empty).toContain('>Cancel<');
    const withRow = [row({ portId: 'a' })];
    expect(render({ rows: withRow })).toMatch(/<button[^>]*disabled=""[^>]*>Use this port<\/button>/);
    expect(render({ rows: withRow, selectedPortId: 'a' })).not.toMatch(/<button[^>]*disabled=""[^>]*>Use this port<\/button>/);
    expect(render({ rows: withRow, selectedPortId: 'a', refreshing: true })).toContain('Refreshing…');
  });

  it('states that choosing a port sends nothing to the device', () => {
    expect(render()).toContain('does not send a program or start anything');
  });
});
