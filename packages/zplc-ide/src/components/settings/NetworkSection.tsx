/** Wi-Fi or Ethernet of the board (secrets are never written to the project). */

import type {
  NetworkConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';

export function NetworkSection({ config, updateConfig }: SectionProps) {
  const networkType = getBoardNetworkType(config.target?.board);
  const network: NetworkConfig | undefined = config.network;

  if (networkType === 'none') {
    return (
      <div className="pt-4 text-xs text-[var(--color-surface-400)]">
        Select a board with network hardware to configure Wi-Fi or Ethernet.
      </div>
    );
  }

  const updateNetwork = (next: NetworkConfig) => {
    updateConfig({ network: next });
  };

  if (networkType === 'wifi') {
    const wifi = network?.wifi ?? {
      enabled: true,
      security: 'wpa2-psk' as const,
      hiddenSsid: false,
      ipv4: { dhcp: true },
    };

    return (
      <div className="pt-4 space-y-3">
        <input
          type="text"
          value={network?.hostname || ''}
          onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, wifi })}
          placeholder="Hostname (optional)"
          className="w-full px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
        />
        <div className="grid grid-cols-4 gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
            <input
              type="checkbox"
              checked={wifi.enabled}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, enabled: e.target.checked } })}
            />
            Wi-Fi Enabled
          </label>
          <input
            type="text"
            value={wifi.ssid || ''}
            onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ssid: e.target.value || undefined } })}
            placeholder="SSID"
            className="col-span-2 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
          <select
            value={wifi.security}
            onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, security: e.target.value as typeof wifi.security } })}
            className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          >
            <option value="open">Open</option>
            <option value="wpa2-psk">WPA2-PSK</option>
            <option value="wpa3-sae">WPA3-SAE</option>
          </select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <input
            type="password"
            value=""
            disabled
            placeholder="Wi-Fi password"
            className="col-span-2 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded disabled:cursor-not-allowed disabled:opacity-60"
          />
          <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
            <input
              type="checkbox"
              checked={wifi.hiddenSsid}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, hiddenSsid: e.target.checked } })}
            />
            Hidden SSID
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
            <input
              type="checkbox"
              checked={wifi.ipv4.dhcp}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dhcp: e.target.checked } } })}
            />
            DHCP
          </label>
        </div>
        <p className="text-xs text-[var(--color-surface-300)]">Credentials are excluded from zplc.json; local secret storage is not available in this build.</p>
        {!wifi.ipv4.dhcp && (
          <div className="grid grid-cols-4 gap-3">
            <input
              type="text"
              value={wifi.ipv4.ip || ''}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, ip: e.target.value || undefined } } })}
              placeholder="Static IP"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={wifi.ipv4.netmask || ''}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, netmask: e.target.value || undefined } } })}
              placeholder="Netmask"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={wifi.ipv4.gateway || ''}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, gateway: e.target.value || undefined } } })}
              placeholder="Gateway"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={wifi.ipv4.dns || ''}
              onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dns: e.target.value || undefined } } })}
              placeholder="DNS"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-2">NTP Time Synchronization</label>
          <div className="grid grid-cols-4 gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={network?.ntp?.enabled ?? true}
                onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })}
              />
              NTP Enabled
            </label>
            <input
              type="text"
              value={network?.ntp?.server ?? 'pool.ntp.org'}
              onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })}
              placeholder="NTP server (e.g. pool.ntp.org)"
              className="col-span-3 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
        </div>
      </div>
    );
  }

  const ethernet = network?.ethernet ?? {
    enabled: true,
    ipv4: { dhcp: true },
  };

  return (
    <div className="pt-4 space-y-3">
      <input
        type="text"
        value={network?.hostname || ''}
        onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, ethernet })}
        placeholder="Hostname (optional)"
        className="w-full px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
      />
      <div className="grid grid-cols-4 gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
          <input
            type="checkbox"
            checked={ethernet.enabled}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, enabled: e.target.checked } })}
          />
          Ethernet Enabled
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
          <input
            type="checkbox"
            checked={ethernet.ipv4.dhcp}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dhcp: e.target.checked } } })}
          />
          DHCP
        </label>
        <input
          type="text"
          value={ethernet.macAddress || ''}
          onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, macAddress: e.target.value || undefined } })}
          placeholder="MAC (optional)"
          className="col-span-2 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
        />
      </div>
      {!ethernet.ipv4.dhcp && (
        <div className="grid grid-cols-4 gap-3">
          <input
            type="text"
            value={ethernet.ipv4.ip || ''}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, ip: e.target.value || undefined } } })}
            placeholder="Static IP"
            className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
          <input
            type="text"
            value={ethernet.ipv4.netmask || ''}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, netmask: e.target.value || undefined } } })}
            placeholder="Netmask"
            className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
          <input
            type="text"
            value={ethernet.ipv4.gateway || ''}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, gateway: e.target.value || undefined } } })}
            placeholder="Gateway"
            className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
          <input
            type="text"
            value={ethernet.ipv4.dns || ''}
            onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dns: e.target.value || undefined } } })}
            placeholder="DNS"
            className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
        </div>
      )}
      <div>
        <label className="block text-xs text-[var(--color-surface-400)] mb-2">NTP Time Synchronization</label>
        <div className="grid grid-cols-4 gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
            <input
              type="checkbox"
              checked={network?.ntp?.enabled ?? true}
              onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })}
            />
            NTP Enabled
          </label>
          <input
            type="text"
            value={network?.ntp?.server ?? 'pool.ntp.org'}
            onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })}
            placeholder="NTP server (e.g. pool.ntp.org)"
            className="col-span-3 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
          />
        </div>
      </div>
    </div>
  );
}
