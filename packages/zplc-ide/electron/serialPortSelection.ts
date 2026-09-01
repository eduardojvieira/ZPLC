export interface SerialPortCandidate {
  portId: string;
  displayName?: string;
  portName?: string;
}

export interface SerialPortDialog {
  showMessageBox(options: {
    type: 'question';
    title: string;
    message: string;
    detail: string;
    buttons: string[];
    defaultId: number;
    cancelId: number;
    noLink: boolean;
  }): Promise<{ response: number }>;
}

const MAX_PORTS = 16;
const MAX_LABEL_LENGTH = 96;

function isUnsafeLabelCodePoint(code: number): boolean {
  return code < 0x20 || code === 0x7F || code === 0x061C
    || (code >= 0x200B && code <= 0x200F)
    || (code >= 0x202A && code <= 0x202E)
    || (code >= 0x2060 && code <= 0x2069)
    || code === 0xFEFF;
}

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const label = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return isUnsafeLabelCodePoint(code) ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  return label.length > 0 ? Array.from(label).slice(0, MAX_LABEL_LENGTH).join('') : null;
}

function selectablePorts(ports: readonly SerialPortCandidate[]): SerialPortCandidate[] {
  return ports.flatMap((port) => {
    if (typeof port.portId !== 'string' || port.portId.length === 0 || port.portId.length > 256) return [];
    return [port];
  }).slice(0, MAX_PORTS);
}

function portLabel(port: SerialPortCandidate, index: number): string {
  return cleanLabel(port.displayName) ?? cleanLabel(port.portName) ?? `Serial port ${index + 1}`;
}

/** Resolves the one Electron serial-selection callback after an explicit human choice. */
export async function selectSerialPort(options: {
  ports: readonly SerialPortCandidate[];
  dialog: SerialPortDialog;
  isCurrent: () => boolean;
  isPortStale: (portId: string) => boolean;
  callback: (portId: string) => void;
}): Promise<void> {
  let finished = false;
  const finish = (portId = ''): void => {
    if (finished) return;
    finished = true;
    options.callback(portId);
  };

  try {
    const ports = selectablePorts(options.ports);
    if (!options.isCurrent() || ports.length === 0) return finish();
    const response = await options.dialog.showMessageBox({
      type: 'question',
      title: 'Select serial port',
      message: 'Select the serial port to request.',
      detail: 'This grants access only for the current request. It does not connect to, deploy to, or control hardware.',
      buttons: ['Cancel', ...ports.map(portLabel)],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    const selected = Number.isInteger(response.response) ? ports[response.response - 1] : undefined;
    if (!options.isCurrent() || !selected || options.isPortStale(selected.portId)) return finish();
    finish(selected.portId);
  } catch {
    finish();
  }
}
