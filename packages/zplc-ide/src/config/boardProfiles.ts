import type { NetworkConfig } from '../types';
import supportedBoardsManifest from '../../../../firmware/app/boards/supported-boards.v1.5.0.json';

export const NETWORK_INTERFACE = {
  NONE: 'none',
  WIFI: 'wifi',
  ETHERNET: 'ethernet',
} as const;

export type NetworkInterfaceKind = (typeof NETWORK_INTERFACE)[keyof typeof NETWORK_INTERFACE];

export interface BoardOption {
  value: string;
  label: string;
}

interface BoardProfile {
  label: string;
  network: NetworkInterfaceKind;
}

interface SupportedBoardManifestEntry {
  board_id: string;
  display_name: string;
  ide_id: string;
  network_class: 'serial-focused' | 'network-capable' | 'other';
  network_interface: 'none' | 'wifi' | 'ethernet';
}

function mapNetworkClassToInterface(
  networkInterface: SupportedBoardManifestEntry['network_interface']
): NetworkInterfaceKind {
  if (networkInterface === 'wifi') {
    return NETWORK_INTERFACE.WIFI;
  }

  if (networkInterface === 'ethernet') {
    return NETWORK_INTERFACE.ETHERNET;
  }

  return NETWORK_INTERFACE.NONE;
}

const BOARD_PROFILES: Record<string, BoardProfile> = Object.fromEntries(
  (supportedBoardsManifest as SupportedBoardManifestEntry[]).map((board) => [
    board.ide_id,
    {
      label: board.display_name,
      network: mapNetworkClassToInterface(board.network_interface),
    },
  ])
);

export const BOARD_OPTIONS: BoardOption[] = [
  { value: '', label: 'Select a board...' },
  ...Object.entries(BOARD_PROFILES).map(([value, profile]) => ({ value, label: profile.label })),
  { value: 'custom', label: 'Custom (enter manually)' },
];

export function getBoardNetworkType(board: string | undefined): NetworkInterfaceKind {
  if (!board) {
    return NETWORK_INTERFACE.NONE;
  }

  return BOARD_PROFILES[board]?.network ?? NETWORK_INTERFACE.NONE;
}

function defaultWifiConfig(existing: NetworkConfig | undefined): NetworkConfig {
  return {
    hostname: existing?.hostname,
    wifi: {
      enabled: existing?.wifi?.enabled ?? true,
      ssid: existing?.wifi?.ssid,
      password: existing?.wifi?.password,
      security: existing?.wifi?.security ?? 'wpa2-psk',
      hiddenSsid: existing?.wifi?.hiddenSsid ?? false,
      ipv4: {
        dhcp: existing?.wifi?.ipv4?.dhcp ?? true,
        ip: existing?.wifi?.ipv4?.ip,
        netmask: existing?.wifi?.ipv4?.netmask,
        gateway: existing?.wifi?.ipv4?.gateway,
        dns: existing?.wifi?.ipv4?.dns,
      },
    },
  };
}

function defaultEthernetConfig(existing: NetworkConfig | undefined): NetworkConfig {
  return {
    hostname: existing?.hostname,
    ethernet: {
      enabled: existing?.ethernet?.enabled ?? true,
      macAddress: existing?.ethernet?.macAddress,
      ipv4: {
        dhcp: existing?.ethernet?.ipv4?.dhcp ?? true,
        ip: existing?.ethernet?.ipv4?.ip,
        netmask: existing?.ethernet?.ipv4?.netmask,
        gateway: existing?.ethernet?.ipv4?.gateway,
        dns: existing?.ethernet?.ipv4?.dns,
      },
    },
  };
}

export function normalizeNetworkConfigForBoard(
  existing: NetworkConfig | undefined,
  board: string | undefined
): NetworkConfig | undefined {
  const networkType = getBoardNetworkType(board);

  if (networkType === NETWORK_INTERFACE.WIFI) {
    return defaultWifiConfig(existing);
  }

  if (networkType === NETWORK_INTERFACE.ETHERNET) {
    return defaultEthernetConfig(existing);
  }

  return undefined;
}
