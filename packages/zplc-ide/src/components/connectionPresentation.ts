/**
 * What Studio is attached to, as text, icon and tone (UX-018): nothing, a simulation (native or browser), or a real
 * device (connecting, connected, faulted). It reads the adapter that is attached and not the mode that is selected, so
 * the indicator cannot say "simulation" about a serial link. Colour is never the only cue: each state has its own words
 * and its own icon. Pure, so every state is tested without a renderer.
 */
import type { Translator } from '../i18n';

export type ConnectionState = 'disconnected' | 'simulation-native' | 'simulation-wasm' | 'hardware-connecting' | 'hardware-connected' | 'hardware-faulted';
export type ConnectionIcon = 'unplug' | 'monitor' | 'globe' | 'loader' | 'cpu' | 'alert';
export type ConnectionTone = 'neutral' | 'info' | 'warning' | 'danger';

export interface ConnectionIndicatorInput {
  mode: 'simulate' | 'hardware';
  adapterType: 'native' | 'serial' | 'wasm' | null;
  connected: boolean;
  connecting: boolean;
  faulted: boolean;
  /** The board the device reported, when it did. */
  board?: string;
  /** How Studio talks to the device, when it knows. */
  link?: 'framed' | 'shell';
}

export interface ConnectionIndicatorView {
  state: ConnectionState;
  label: string;
  icon: ConnectionIcon;
  tone: ConnectionTone;
}

export function presentConnection(input: ConnectionIndicatorInput, t: Translator['t']): ConnectionIndicatorView {
  if (input.connected && input.adapterType === 'serial') {
    const detail = [input.board, input.link === undefined ? undefined : t(input.link === 'framed' ? 'connection.link.framed' : 'connection.link.shell')];
    const label = (head: string) => [head, ...detail.filter((part): part is string => part !== undefined)].join(' · ');
    return input.faulted
      ? { state: 'hardware-faulted', label: label(t('connection.hardware.faulted')), icon: 'alert', tone: 'danger' }
      : { state: 'hardware-connected', label: label(t('connection.hardware.connected')), icon: 'cpu', tone: 'warning' };
  }
  if (input.connected && input.adapterType === 'native') return { state: 'simulation-native', label: t('connection.simulation.native'), icon: 'monitor', tone: 'info' };
  if (input.connected && input.adapterType === 'wasm') return { state: 'simulation-wasm', label: t('connection.simulation.wasm'), icon: 'globe', tone: 'info' };
  if (input.mode === 'hardware' && input.connecting) return { state: 'hardware-connecting', label: t('connection.hardware.connecting'), icon: 'loader', tone: 'warning' };
  return { state: 'disconnected', label: t('connection.disconnected'), icon: 'unplug', tone: 'neutral' };
}
