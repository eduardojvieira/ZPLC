/**
 * Two learner boards as test inputs, with the pins of the learner assignment (lrn-shared.md section C), frozen here so
 * that the golden diagrams do not move when firmware/app/boards/boards.json changes. The live boards are read by the
 * lesson loader and the docs generator; these only feed the unit and golden tests.
 */
import { readBoardIo, type BoardIoDescription } from '../boardIo';
import type { WiringBoard, WiringFile } from './wiring';

const digital = (id: string, direction: 'input' | 'output', address: string, pin: string, location: string) => ({
  id,
  direction,
  kind: 'digital',
  address,
  pin,
  location,
  electrical: '3.3 V logic. Not 5 V tolerant.',
  pin_status: 'devicetree',
  source: 'fixture',
  ...(direction === 'output' ? { safe: 0 } : {}),
});
const analog = (id: string, pin: string, location: string) => ({
  id,
  direction: 'input',
  kind: 'analog',
  address: '%IW4',
  pin,
  location,
  electrical: '0 V to 3.3 V.',
  pin_status: 'devicetree',
  source: 'fixture',
  resolution_bits: 12,
  range: { raw_min: 0, raw_max: 4095, eng_min: 0, eng_max: 3.3, unit: 'V' },
});
const io = (channels: unknown[]): BoardIoDescription => readBoardIo({ schema_version: 1, channels, unmapped: [] })!;

export const PICO: WiringBoard = {
  boardId: 'rpi-pico-rp2040',
  displayName: 'Raspberry Pi Pico (RP2040)',
  supply: '3V3(OUT) · pin 36',
  ground: 'GND · pin 38',
  analogGround: 'AGND · pin 33',
  io: io([
    digital('DO0', 'output', '%QX0.0', 'GP0', 'header pin 1'),
    digital('DO1', 'output', '%QX0.1', 'GP1', 'header pin 2'),
    digital('DO2', 'output', '%QX0.2', 'GP2', 'header pin 4'),
    digital('DO3', 'output', '%QX0.3', 'GP3', 'header pin 5'),
    digital('DO4', 'output', '%QX0.4', 'GP25', 'on-board LED'),
    digital('DI0', 'input', '%IX0.0', 'GP15', 'header pin 20'),
    digital('DI1', 'input', '%IX0.1', 'GP14', 'header pin 19'),
    digital('DI2', 'input', '%IX0.2', 'GP13', 'header pin 17'),
    digital('DI3', 'input', '%IX0.3', 'GP12', 'header pin 16'),
    analog('AI0', 'GP26 (ADC0)', 'header pin 31'),
  ]),
};

export const ESP32S3: WiringBoard = {
  boardId: 'esp32-s3-devkitc',
  displayName: 'ESP32-S3-DevKitC-1 (N8R8)',
  supply: '3V3 · J1-1',
  ground: 'GND · J1-22',
  analogGround: 'GND · J1-22',
  io: io([
    digital('DO0', 'output', '%QX0.0', 'GPIO15', 'J1-8'),
    digital('DO1', 'output', '%QX0.1', 'GPIO16', 'J1-9'),
    digital('DO2', 'output', '%QX0.2', 'GPIO17', 'J1-10'),
    digital('DO3', 'output', '%QX0.3', 'GPIO18', 'J1-11'),
    digital('DI0', 'input', '%IX0.0', 'GPIO5', 'J1-5'),
    digital('DI1', 'input', '%IX0.1', 'GPIO6', 'J1-6'),
    digital('DI2', 'input', '%IX0.2', 'GPIO7', 'J1-7'),
    digital('DI3', 'input', '%IX0.3', 'GPIO8', 'J1-12'),
    analog('AI0', 'GPIO4 (ADC1 channel 3)', 'J1-4'),
  ]),
};

export const BOARDS: readonly WiringBoard[] = [PICO, ESP32S3];

/** Every kind of part the course uses, and the on-board LED of the Pico, wired on the Pico only. */
export const WIRING: WiringFile = {
  schemaVersion: 1,
  parts: [
    { id: 'lamp', kind: 'led', channel: 'DO0', color: 'red', resistorOhms: 330, label: { en: 'Lamp', es: 'Lámpara' } },
    { id: 'warning', kind: 'led', channel: 'DO1', color: 'yellow', resistorOhms: 330, label: { en: 'Warning', es: 'Advertencia' } },
    { id: 'start', kind: 'button', channel: 'DI0', label: { en: 'Start', es: 'Arranque' } },
    { id: 'armed', kind: 'jumper', channel: 'DI1', label: { en: 'Armed', es: 'Armado' } },
    { id: 'stop', kind: 'button', channel: 'DI3', label: { en: 'Stop', es: 'Parada' } },
    { id: 'level', kind: 'potentiometer', channel: 'AI0', ohms: 10000, label: { en: 'Level', es: 'Nivel' } },
    { id: 'onboard', kind: 'led', channel: 'DO4', boards: ['rpi-pico-rp2040'], label: { en: 'On-board LED', es: 'LED de la placa' } },
  ],
};
