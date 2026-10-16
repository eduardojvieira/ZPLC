/** Wi-Fi or Ethernet of the board (secrets are never written to the project). */

import type {
  NetworkConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';
import { Checkbox, Select, TextField } from '../../ui';

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
        <TextField value={network?.hostname || ''} onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, wifi })} placeholder="Hostname (optional)" className="w-full" aria-label="Hostname (optional)" />
        <div className="grid grid-cols-4 gap-3">
          <Checkbox checked={wifi.enabled} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, enabled: e.target.checked } })} label="Wi-Fi Enabled" />
          <TextField value={wifi.ssid || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ssid: e.target.value || undefined } })} placeholder="SSID" className="col-span-2" aria-label="SSID" />
          <Select aria-label="Security" value={wifi.security} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, security: e.target.value as typeof wifi.security } })}>
            <option value="open">Open</option>
            <option value="wpa2-psk">WPA2-PSK</option>
            <option value="wpa3-sae">WPA3-SAE</option>
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <TextField type="password" value="" disabled placeholder="Wi-Fi password" className="col-span-2" aria-label="Wi-Fi password" />
          <Checkbox checked={wifi.hiddenSsid} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, hiddenSsid: e.target.checked } })} label="Hidden SSID" />
          <Checkbox checked={wifi.ipv4.dhcp} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dhcp: e.target.checked } } })} label="DHCP" />
        </div>
        <p className="text-xs text-[var(--color-surface-300)]">Credentials are excluded from zplc.json; local secret storage is not available in this build.</p>
        {!wifi.ipv4.dhcp && (
          <div className="grid grid-cols-4 gap-3">
            <TextField value={wifi.ipv4.ip || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, ip: e.target.value || undefined } } })} placeholder="Static IP" aria-label="Static IP" />
            <TextField value={wifi.ipv4.netmask || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, netmask: e.target.value || undefined } } })} placeholder="Netmask" aria-label="Netmask" />
            <TextField value={wifi.ipv4.gateway || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, gateway: e.target.value || undefined } } })} placeholder="Gateway" aria-label="Gateway" />
            <TextField value={wifi.ipv4.dns || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dns: e.target.value || undefined } } })} placeholder="DNS" aria-label="DNS" />
          </div>
        )}
        <div>
          <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">NTP Time Synchronization</h3>
          <div className="grid grid-cols-4 gap-3">
            <Checkbox checked={network?.ntp?.enabled ?? true} onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })} label="NTP Enabled" />
            <TextField value={network?.ntp?.server ?? 'pool.ntp.org'} onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })} placeholder="NTP server (e.g. pool.ntp.org)" className="col-span-3" aria-label="NTP server (e.g. pool.ntp.org)" />
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
      <TextField value={network?.hostname || ''} onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, ethernet })} placeholder="Hostname (optional)" className="w-full" aria-label="Hostname (optional)" />
      <div className="grid grid-cols-4 gap-3">
        <Checkbox checked={ethernet.enabled} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, enabled: e.target.checked } })} label="Ethernet Enabled" />
        <Checkbox checked={ethernet.ipv4.dhcp} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dhcp: e.target.checked } } })} label="DHCP" />
        <TextField value={ethernet.macAddress || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, macAddress: e.target.value || undefined } })} placeholder="MAC (optional)" className="col-span-2" aria-label="MAC (optional)" />
      </div>
      {!ethernet.ipv4.dhcp && (
        <div className="grid grid-cols-4 gap-3">
          <TextField value={ethernet.ipv4.ip || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, ip: e.target.value || undefined } } })} placeholder="Static IP" aria-label="Static IP" />
          <TextField value={ethernet.ipv4.netmask || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, netmask: e.target.value || undefined } } })} placeholder="Netmask" aria-label="Netmask" />
          <TextField value={ethernet.ipv4.gateway || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, gateway: e.target.value || undefined } } })} placeholder="Gateway" aria-label="Gateway" />
          <TextField value={ethernet.ipv4.dns || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dns: e.target.value || undefined } } })} placeholder="DNS" aria-label="DNS" />
        </div>
      )}
      <div>
        <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">NTP Time Synchronization</h3>
        <div className="grid grid-cols-4 gap-3">
          <Checkbox checked={network?.ntp?.enabled ?? true} onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })} label="NTP Enabled" />
          <TextField value={network?.ntp?.server ?? 'pool.ntp.org'} onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })} placeholder="NTP server (e.g. pool.ntp.org)" className="col-span-3" aria-label="NTP server (e.g. pool.ntp.org)" />
        </div>
      </div>
    </div>
  );
}
