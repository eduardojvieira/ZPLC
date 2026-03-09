import type { NetworkConfig } from '../types';

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

const BOARD_PROFILES: Record<string, BoardProfile> = {
  rpi_pico: { label: 'Raspberry Pi Pico (RP2040)', network: NETWORK_INTERFACE.NONE },
  rpi_pico_w: { label: 'Raspberry Pi Pico W (RP2040 + WiFi)', network: NETWORK_INTERFACE.WIFI },
  arduino_giga_r1: { label: 'Arduino GIGA R1 (STM32H747)', network: NETWORK_INTERFACE.WIFI },
  arduino_opta: { label: 'Arduino Opta (Industrial PLC)', network: NETWORK_INTERFACE.ETHERNET },
  nucleo_h743zi: { label: 'STM32 Nucleo H743ZI', network: NETWORK_INTERFACE.ETHERNET },
  nucleo_f446re: { label: 'STM32 Nucleo F446RE', network: NETWORK_INTERFACE.NONE },
  stm32f746g_disco: { label: 'STM32F746G Discovery', network: NETWORK_INTERFACE.ETHERNET },
  esp32s3_devkitc: { label: 'ESP32-S3 DevKitC', network: NETWORK_INTERFACE.WIFI },
  esp32_devkitc_wroom: { label: 'ESP32 DevKitC WROOM', network: NETWORK_INTERFACE.WIFI },
  esp32_nodemcu: { label: 'ESP32 NodeMCU', network: NETWORK_INTERFACE.WIFI },
  nrf52840dk: { label: 'Nordic nRF52840 DK', network: NETWORK_INTERFACE.NONE },
  mps2_an385: { label: 'ARM MPS2+ AN385 (QEMU)', network: NETWORK_INTERFACE.NONE },
};

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
