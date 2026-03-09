import { describe, expect, test } from 'bun:test';

import {
  getBoardNetworkType,
  normalizeNetworkConfigForBoard,
} from './boardProfiles';

describe('board network profile mapping', () => {
  test('maps Wi-Fi boards correctly', () => {
    expect(getBoardNetworkType('esp32s3_devkitc')).toBe('wifi');
    expect(getBoardNetworkType('esp32_devkitc_wroom')).toBe('wifi');
    expect(getBoardNetworkType('esp32_nodemcu')).toBe('wifi');
    expect(getBoardNetworkType('rpi_pico_w')).toBe('wifi');
    expect(getBoardNetworkType('arduino_giga_r1')).toBe('wifi');
  });

  test('maps Ethernet boards correctly', () => {
    expect(getBoardNetworkType('stm32f746g_disco')).toBe('ethernet');
    expect(getBoardNetworkType('nucleo_h743zi')).toBe('ethernet');
    expect(getBoardNetworkType('arduino_opta')).toBe('ethernet');
  });

  test('returns none for unknown or non-network boards', () => {
    expect(getBoardNetworkType('rpi_pico')).toBe('none');
    expect(getBoardNetworkType('custom')).toBe('none');
    expect(getBoardNetworkType(undefined)).toBe('none');
  });
});

describe('network normalization by board', () => {
  test('keeps only Wi-Fi config on Wi-Fi boards', () => {
    const normalized = normalizeNetworkConfigForBoard(
      {
        hostname: 'zplc-cell-a',
        wifi: {
          enabled: true,
          security: 'wpa2-psk',
          ssid: 'PlantWiFi',
          password: 'secret',
          hiddenSsid: false,
          ipv4: { dhcp: true },
        },
        ethernet: {
          enabled: true,
          ipv4: { dhcp: false, ip: '192.168.10.20', gateway: '192.168.10.1' },
        },
      },
      'esp32s3_devkitc'
    );

    expect(normalized?.wifi?.ssid).toBe('PlantWiFi');
    expect(normalized?.ethernet).toBeUndefined();
  });

  test('keeps only Ethernet config on Ethernet boards', () => {
    const normalized = normalizeNetworkConfigForBoard(
      {
        wifi: {
          enabled: true,
          security: 'wpa2-psk',
          ssid: 'ShouldDrop',
          hiddenSsid: false,
          ipv4: { dhcp: true },
        },
      },
      'stm32f746g_disco'
    );

    expect(normalized?.wifi).toBeUndefined();
    expect(normalized?.ethernet?.enabled).toBe(true);
  });

  test('returns undefined for boards without network profile', () => {
    const normalized = normalizeNetworkConfigForBoard(undefined, 'rpi_pico');
    expect(normalized).toBeUndefined();
  });
});
