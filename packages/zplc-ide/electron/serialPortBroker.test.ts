import { describe, expect, test } from 'bun:test';

import { createSerialPortBroker, type SystemSerialPort } from './serialPortBroker';
import { SERIAL_PORT_LIMITS, isSerialPortChoice, isSerialPortListRequest, parseSerialPortOffer, type SerialPortOffer } from './serialPortProtocol';

const PICO: SystemSerialPort = { portId: 'private-port-1', displayName: 'Pico', vendorId: '11914', productId: '10', serialNumber: 'E6614C311B' };
const BRIDGE: SystemSerialPort = { portId: 'private-port-2', portName: 'ttyUSB0', vendorId: '1027', productId: '24577' };

function fixture(options: { deliver?: boolean } = {}) {
  const sent: Array<{ ownerId: number; offer: SerialPortOffer }> = [];
  let next = 0;
  const answers: string[] = [];
  const broker = createSerialPortBroker({
    send: (ownerId, offer) => { sent.push({ ownerId, offer }); return options.deliver !== false; },
    newRequestId: () => `request-${++next}`,
  });
  const callback = (portId: string) => { answers.push(portId); };
  return { broker, sent, answers, callback };
}

describe('serial port broker (IDE-018)', () => {
  test('asks the window that asked, with the name and the USB numbers of every port, and answers Electron once with the choice', () => {
    const { broker, sent, answers, callback } = fixture();
    const requestId = broker.open({ ownerId: 7, ports: [PICO, BRIDGE], callback });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({ ownerId: 7, offer: { requestId, ports: [
      { portId: 'private-port-1', name: 'Pico', vendorId: 0x2E8A, productId: 0x000A, serialNumber: 'E6614C311B' },
      { portId: 'private-port-2', name: 'ttyUSB0', vendorId: 0x0403, productId: 0x6001 },
    ] } });
    expect(parseSerialPortOffer(sent[0]!.offer)).toEqual(sent[0]!.offer);

    broker.choose(7, requestId, 'private-port-2');
    broker.choose(7, requestId, 'private-port-1'); // a second answer is not a second choice
    expect(answers).toEqual(['private-port-2']);
    expect(broker.size()).toBe(0);
  });

  test('cancels when the window cancels, answers with a port that is not in the offer, or is not the window that was asked', () => {
    const { broker, answers, callback } = fixture();
    const first = broker.open({ ownerId: 1, ports: [PICO], callback });
    broker.choose(1, first, null);
    const second = broker.open({ ownerId: 1, ports: [PICO], callback });
    broker.choose(1, second, 'a-port-the-system-never-offered');
    const third = broker.open({ ownerId: 1, ports: [PICO], callback });
    broker.choose(2, third, 'private-port-1'); // another window: ignored, the question stays open
    expect(answers).toEqual(['', '']);
    expect(broker.size()).toBe(1);
    expect(broker.list(2, third)).toBeNull();
    broker.choose(1, third, 'private-port-1');
    expect(answers).toEqual(['', '', 'private-port-1']);
  });

  test('keeps the dialog current: a device that is plugged in is offered, one that goes away is not accepted', () => {
    const { broker, sent, answers, callback } = fixture();
    const requestId = broker.open({ ownerId: 3, ports: [PICO], callback });
    broker.added(3, BRIDGE);
    broker.added(3, BRIDGE); // the same port twice is one port
    expect(sent.at(-1)!.offer.ports.map((port) => port.portId)).toEqual(['private-port-1', 'private-port-2']);
    expect(broker.list(3, requestId)!.ports).toHaveLength(2);

    broker.removed(3, 'private-port-2');
    expect(sent.at(-1)!.offer.ports.map((port) => port.portId)).toEqual(['private-port-1']);
    broker.choose(3, requestId, 'private-port-2'); // chosen a moment before it went away
    expect(answers).toEqual(['']);
  });

  test('cleans and bounds what a device calls itself, and offers a port that has no name as "Serial port n"', () => {
    const { broker, sent, callback } = fixture();
    broker.open({
      ownerId: 1, callback,
      ports: [
        { portId: 'a', displayName: `PLC${String.fromCharCode(0, 0x202E, 0x200B)} ${'x'.repeat(200)}` },
        { portId: 'b' },
        { portId: '', displayName: 'no identifier' },
        { portId: 'c', displayName: 'bad numbers', vendorId: '99999999', productId: 'abc' },
      ],
    });
    const ports = sent[0]!.offer.ports;
    expect(ports.map((port) => port.portId)).toEqual(['a', 'b', 'c']);
    expect(ports[0]!.name).toHaveLength(SERIAL_PORT_LIMITS.maxTextChars);
    for (const code of [0, 0x202E, 0x200B]) expect(ports[0]!.name.includes(String.fromCharCode(code))).toBe(false);
    expect(ports[1]!.name).toBe('Serial port 2');
    expect(ports[2]).toEqual({ portId: 'c', name: 'bad numbers' });
    expect(parseSerialPortOffer(sent[0]!.offer)).not.toBeNull();
  });

  test('offers at most sixteen ports', () => {
    const { broker, sent, callback } = fixture();
    broker.open({ ownerId: 1, callback, ports: Array.from({ length: 40 }, (_, index) => ({ portId: `p${index}`, displayName: `Port ${index}` })) });
    expect(sent[0]!.offer.ports).toHaveLength(SERIAL_PORT_LIMITS.maxPorts);
  });

  test('cancels at once when the window cannot be asked, and cancels the questions of a window that goes away', () => {
    const unreachable = fixture({ deliver: false });
    unreachable.broker.open({ ownerId: 1, ports: [PICO], callback: unreachable.callback });
    expect(unreachable.answers).toEqual(['']);
    expect(unreachable.broker.size()).toBe(0);

    const { broker, answers, callback } = fixture();
    broker.open({ ownerId: 1, ports: [PICO], callback });
    broker.open({ ownerId: 2, ports: [PICO], callback });
    broker.cancelOwner(1);
    expect(answers).toEqual(['']);
    expect(broker.size()).toBe(1);
  });

  test('an empty list is offered as it is: the dialog says there is no port and can be refreshed', () => {
    const { broker, sent, callback } = fixture();
    const requestId = broker.open({ ownerId: 1, ports: [], callback });
    expect(sent[0]!.offer).toEqual({ requestId, ports: [] });
    expect(broker.list(1, requestId)).toEqual({ requestId, ports: [] });
  });
});

describe('serial port messages', () => {
  test('an offer must be exactly requestId and ports, each port exactly its fields, with USB numbers in range', () => {
    const port = { portId: 'p', name: 'Pico', vendorId: 1, productId: 2 };
    expect(parseSerialPortOffer({ requestId: 'r', ports: [port] })).toEqual({ requestId: 'r', ports: [port] });
    for (const bad of [
      null, [], { requestId: 'r' }, { requestId: '', ports: [] }, { requestId: 'r', ports: [], extra: 1 },
      { requestId: 'r', ports: [{ ...port, extra: 1 }] }, { requestId: 'r', ports: [{ ...port, vendorId: 70000 }] },
      { requestId: 'r', ports: [{ ...port, productId: -1 }] }, { requestId: 'r', ports: [{ ...port, vendorId: '1' }] },
      { requestId: 'r', ports: [port, port] }, { requestId: 'r', ports: [{ portId: 'p' }] },
      { requestId: 'r', ports: Array.from({ length: 17 }, (_, index) => ({ portId: `p${index}`, name: 'x' })) },
    ]) expect(parseSerialPortOffer(bad)).toBeNull();
  });

  test('an answer is a request id and a port id or null, and nothing else', () => {
    expect(isSerialPortChoice({ requestId: 'r', portId: 'p' })).toBe(true);
    expect(isSerialPortChoice({ requestId: 'r', portId: null })).toBe(true);
    for (const bad of [null, 'r', {}, { requestId: 'r' }, { requestId: 'r', portId: '' }, { requestId: 'r', portId: 'p', path: '/dev/ttyUSB0' }, { requestId: 5, portId: 'p' }, { requestId: 'r', portId: 'x'.repeat(300) }]) {
      expect(isSerialPortChoice(bad)).toBe(false);
    }
    expect(isSerialPortListRequest({ requestId: 'r' })).toBe(true);
    for (const bad of [null, {}, { requestId: '' }, { requestId: 'r', portId: 'p' }]) expect(isSerialPortListRequest(bad)).toBe(false);
  });
});
