/** Wi-Fi or Ethernet of the board (secrets are never written to the project). */

import type {
  NetworkConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';
import { Checkbox, Select, TextField } from '../../ui';
import { useT } from '../../i18n';

export function NetworkSection({ config, updateConfig }: SectionProps) {
  const { t } = useT();
  const networkType = getBoardNetworkType(config.target?.board);
  const network: NetworkConfig | undefined = config.network;

  if (networkType === 'none') {
    return (
      <div className="pt-4 text-xs text-[var(--color-surface-400)]">
        {t('network.selectABoardWith')}
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
        <TextField value={network?.hostname || ''} onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, wifi })} placeholder={t('network.hostnameOptional')} className="w-full" aria-label={t('network.hostnameOptional')} />
        <div className="grid grid-cols-4 gap-3">
          <Checkbox checked={wifi.enabled} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, enabled: e.target.checked } })} label={t('network.wiFiEnabled')} />
          <TextField value={wifi.ssid || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ssid: e.target.value || undefined } })} placeholder={t('network.ssid')} className="col-span-2" aria-label={t('network.ssid')} />
          <Select aria-label={t('network.security')} value={wifi.security} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, security: e.target.value as typeof wifi.security } })}>
            <option value="open">{t('network.open')}</option>
            <option value="wpa2-psk">{t('network.wpa2Psk')}</option>
            <option value="wpa3-sae">{t('network.wpa3Sae')}</option>
          </Select>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <TextField type="password" value="" disabled placeholder={t('network.wiFiPassword')} className="col-span-2" aria-label={t('network.wiFiPassword')} />
          <Checkbox checked={wifi.hiddenSsid} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, hiddenSsid: e.target.checked } })} label={t('network.hiddenSsid')} />
          <Checkbox checked={wifi.ipv4.dhcp} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dhcp: e.target.checked } } })} label={t('network.dhcp')} />
        </div>
        <p className="text-xs text-[var(--color-surface-300)]">{t('network.credentialsAreExcludedFrom')}</p>
        {!wifi.ipv4.dhcp && (
          <div className="grid grid-cols-4 gap-3">
            <TextField value={wifi.ipv4.ip || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, ip: e.target.value || undefined } } })} placeholder={t('network.staticIp')} aria-label={t('network.staticIp')} />
            <TextField value={wifi.ipv4.netmask || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, netmask: e.target.value || undefined } } })} placeholder={t('network.netmask')} aria-label={t('network.netmask')} />
            <TextField value={wifi.ipv4.gateway || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, gateway: e.target.value || undefined } } })} placeholder={t('network.gateway')} aria-label={t('network.gateway')} />
            <TextField value={wifi.ipv4.dns || ''} onChange={(e) => updateNetwork({ ...network, wifi: { ...wifi, ipv4: { ...wifi.ipv4, dns: e.target.value || undefined } } })} placeholder={t('network.dns')} aria-label={t('network.dns')} />
          </div>
        )}
        <div>
          <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">{t('network.ntpTimeSynchronization')}</h3>
          <div className="grid grid-cols-4 gap-3">
            <Checkbox checked={network?.ntp?.enabled ?? true} onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })} label={t('network.ntpEnabled')} />
            <TextField value={network?.ntp?.server ?? 'pool.ntp.org'} onChange={(e) => updateNetwork({ ...network, wifi, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })} placeholder={t('network.ntpServerEG')} className="col-span-3" aria-label={t('network.ntpServerEG')} />
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
      <TextField value={network?.hostname || ''} onChange={(e) => updateNetwork({ ...network, hostname: e.target.value || undefined, ethernet })} placeholder={t('network.hostnameOptional')} className="w-full" aria-label={t('network.hostnameOptional')} />
      <div className="grid grid-cols-4 gap-3">
        <Checkbox checked={ethernet.enabled} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, enabled: e.target.checked } })} label={t('network.ethernetEnabled')} />
        <Checkbox checked={ethernet.ipv4.dhcp} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dhcp: e.target.checked } } })} label={t('network.dhcp')} />
        <TextField value={ethernet.macAddress || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, macAddress: e.target.value || undefined } })} placeholder={t('network.macOptional')} className="col-span-2" aria-label={t('network.macOptional')} />
      </div>
      {!ethernet.ipv4.dhcp && (
        <div className="grid grid-cols-4 gap-3">
          <TextField value={ethernet.ipv4.ip || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, ip: e.target.value || undefined } } })} placeholder={t('network.staticIp')} aria-label={t('network.staticIp')} />
          <TextField value={ethernet.ipv4.netmask || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, netmask: e.target.value || undefined } } })} placeholder={t('network.netmask')} aria-label={t('network.netmask')} />
          <TextField value={ethernet.ipv4.gateway || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, gateway: e.target.value || undefined } } })} placeholder={t('network.gateway')} aria-label={t('network.gateway')} />
          <TextField value={ethernet.ipv4.dns || ''} onChange={(e) => updateNetwork({ ...network, ethernet: { ...ethernet, ipv4: { ...ethernet.ipv4, dns: e.target.value || undefined } } })} placeholder={t('network.dns')} aria-label={t('network.dns')} />
        </div>
      )}
      <div>
        <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">{t('network.ntpTimeSynchronization')}</h3>
        <div className="grid grid-cols-4 gap-3">
          <Checkbox checked={network?.ntp?.enabled ?? true} onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: e.target.checked, server: network?.ntp?.server ?? 'pool.ntp.org' } })} label={t('network.ntpEnabled')} />
          <TextField value={network?.ntp?.server ?? 'pool.ntp.org'} onChange={(e) => updateNetwork({ ...network, ethernet, ntp: { enabled: network?.ntp?.enabled ?? true, server: e.target.value } })} placeholder={t('network.ntpServerEG')} className="col-span-3" aria-label={t('network.ntpServerEG')} />
        </div>
      </div>
    </div>
  );
}
