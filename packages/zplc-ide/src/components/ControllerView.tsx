/**
 * ControllerView Component
 * 
 * Sidebar panel showing connected device information:
 * - Device info (board, version, capabilities)
 * - State and cycle count
 * - Task list with cycle counts
 * - Memory configuration
 * - OPI/IPI preview
 * 
 * Uses the global connectionManager for status updates.
 */

import { useState, useEffect } from 'react';
import {
  Cpu,
  Activity,
  HardDrive,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Layers,
  Radio,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { connectionManager, type LinkInfo } from '../runtime/connectionManager';
import type { CommunicationMapEntry, MqttRuntimeStatus, SystemInfo, StatusInfo } from '../runtime/serialAdapter';
import { Button, NumberField, SignalValue } from '../ui';
import { useT } from '../i18n';

export function ControllerView() {
  const { t } = useT();
  // State from connection manager
  const [isConnected, setIsConnected] = useState(connectionManager.connected);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(connectionManager.systemInfo);
  const [status, setStatus] = useState<StatusInfo | null>(connectionManager.status);
  const [communicationMap, setCommunicationMap] = useState<CommunicationMapEntry[]>(connectionManager.communicationMap);
  const [mqttStatus, setMqttStatus] = useState<MqttRuntimeStatus | null>(connectionManager.mqttStatus);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  const [linkInfo, setLinkInfo] = useState<LinkInfo>(connectionManager.linkInfo);
  const [modbusDrafts, setModbusDrafts] = useState<Record<number, string>>({});
  
  // UI state
  const [expandedSections, setExpandedSections] = useState({
    info: true,
    tasks: true,
    communication: true,
    mqtt: true,
    memory: false,
    io: false,
  });

  // Subscribe to connection manager events
  useEffect(() => {
    const unsubConnection = connectionManager.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (!connected) {
        setSystemInfo(null);
        setStatus(null);
        setLastUpdateTime(null);
      }
    });

    const unsubSystemInfo = connectionManager.onSystemInfoUpdate((info) => {
      setSystemInfo(info);
    });

    const unsubStatus = connectionManager.onStatusUpdate((newStatus) => {
      setStatus(newStatus);
      setLastUpdateTime(new Date());
    });

    const unsubCommunication = connectionManager.onCommunicationMapUpdate((entries) => {
      setCommunicationMap(entries);
    });

    const unsubMqtt = connectionManager.onMqttStatusUpdate((nextStatus) => {
      setMqttStatus(nextStatus);
    });

    const unsubLink = connectionManager.onLinkInfoUpdate(setLinkInfo);

    return () => {
      unsubLink();
      unsubConnection();
      unsubSystemInfo();
      unsubStatus();
      unsubCommunication();
      unsubMqtt();
    };
  }, []);

  const applyModbusOverride = async (entry: CommunicationMapEntry) => {
    const draft = modbusDrafts[entry.index] ?? String(entry.effective_value);
    const nextAddress = parseInt(draft, 10);
    if (!Number.isFinite(nextAddress) || nextAddress <= 0) {
      return;
    }

    await connectionManager.setModbusAddress(entry.index, nextAddress);
  };

  const clearModbusOverride = async (entry: CommunicationMapEntry) => {
    await connectionManager.clearModbusAddress(entry.index);
  };

  /**
   * Toggle section expansion
   */
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  /**
   * Format uptime in human-readable format
   */
  const formatUptime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  /**
   * Format bytes in human-readable format
   */
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Not connected state
  if (!isConnected) {
    return (
      <div className="p-4 text-center">
        <WifiOff size={32} className="mx-auto mb-2 text-[var(--color-surface-500)]" />
        <p className="text-sm text-[var(--color-surface-400)]">
          {t('controller.noDeviceConnected')}
        </p>
        <p className="text-xs text-[var(--color-surface-400)] mt-1">
          {t('controller.useToolbarConnect')}
        </p>
      </div>
    );
  }

  // Loading state
  if (!systemInfo && !status) {
    return (
      <div className="p-4 text-center">
        <RefreshCw size={24} className="mx-auto mb-2 text-[var(--color-accent-blue)] animate-spin motion-reduce:animate-none" />
        <p className="text-sm text-[var(--color-surface-300)]">
          {t('controller.fetchingDeviceInfo')}
        </p>
      </div>
    );
  }

  return (
    <div className="text-sm">
      {/* Connection Status Header */}
      <div className="flex items-center gap-2 p-3 bg-[var(--color-surface-700)] border-b border-[var(--color-surface-600)]">
        <Wifi size={16} className="text-[var(--color-accent-green)]" />
        <span className="font-medium text-[var(--color-surface-100)]">
          {systemInfo?.board || t('controller.zplcDevice')}
        </span>
        {!connectionManager.passthroughMode && (
          <Activity size={12} className="ml-auto text-[var(--color-accent-blue)]" />
        )}
        {connectionManager.passthroughMode && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]">
            {t('controller.terminal')}
          </span>
        )}
      </div>

      {/* Device Info Section */}
      <div className="border-b border-[var(--color-surface-700)]">
        <Button variant="secondary" size="sm" aria-expanded={expandedSections.info === true} onClick={() => toggleSection('info')} className="w-full justify-start text-left">
          {expandedSections.info ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Cpu size={14} className="text-[var(--color-accent-purple)]" />
          <span className="text-[var(--color-surface-200)]">{t('controller.deviceInfo')}</span>
        </Button>
        
        {expandedSections.info && systemInfo && (
          <div className="px-4 pb-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">{t('controller.zplcVersion')}</span>
              <span className="text-[var(--color-surface-200)]">{systemInfo.zplc_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">{t('controller.zephyr')}</span>
              <span className="text-[var(--color-surface-200)]">{systemInfo.zephyr_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">{t('controller.cpuFrequency')}</span>
              <span className="text-[var(--color-surface-200)]">{t('controller.mhz', { cpu_freq_mhz: systemInfo.cpu_freq_mhz })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">{t('console.uptime')}</span>
              <span className="text-[var(--color-surface-200)]">
                {formatUptime(status?.uptime_ms || systemInfo.uptime_ms)}
              </span>
            </div>
            {/* How the firmware is talked to and how its state is known (COM-025, COM-029) */}
            {linkInfo.firmware && (
              <div className="flex justify-between">
                <span className="text-[var(--color-surface-400)]">{t('controller.link')}</span>
                <span className="text-[var(--color-surface-200)]" data-testid="device-link-protocol">
                  {linkInfo.firmware.protocol.kind === 'framed'
                    ? t('controller.framedProtocol', { version: linkInfo.firmware.protocol.version })
                    : linkInfo.firmware.protocol.kind === 'shell-only' ? t('controller.textShellOlderProtocol') : t('controller.unknown')}
                </span>
              </div>
            )}
            {linkInfo.router && linkInfo.router.source !== 'none' && (
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-surface-400)]">{t('console.state')}</span>
                <span className="text-[var(--color-surface-200)] text-right" data-testid="device-link-source">
                  {linkInfo.router.label}
                  {linkInfo.router.dropped + linkInfo.router.lostByDevice > 0
                    ? t('controller.eventsDropped', { value: linkInfo.router.dropped + linkInfo.router.lostByDevice })
                    : ''}
                </span>
              </div>
            )}
            {linkInfo.firmware?.action === 'use-shell-and-offer-update' && (
              <p className="text-xs text-[var(--color-accent-yellow)]" data-testid="device-link-update">
                {linkInfo.firmware.message}
              </p>
            )}
            {/* Capabilities */}
            <div className="flex gap-1 mt-2">
              {systemInfo.capabilities.fpu && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-purple)] text-[var(--color-on-accent)] rounded text-xs">
                  {t('controller.fpu')}
                </span>
              )}
              {systemInfo.capabilities.scheduler && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-blue)] text-[var(--color-on-accent)] rounded text-xs">
                  {t('controller.mt')}
                </span>
              )}
              {systemInfo.capabilities.mpu && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-green)] text-[var(--color-on-accent)] rounded text-xs">
                  {t('controller.mpu')}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Status Section */}
      {status && (
        <>
          {/* State indicator */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--color-surface-700)]">
            <SignalValue tone={status.state === 'RUNNING' ? 'true' : status.state === 'IDLE' ? 'false' : 'unknown'} className="text-xs font-medium uppercase">
              {status.state || t('controller.unknown2')}
            </SignalValue>
            <span className="ml-auto text-xs text-[var(--color-surface-400)]">
              {t('controller.cycles', { value: (status.stats?.cycles ?? 0).toLocaleString() })}
            </span>
          </div>

          {/* Tasks Section */}
          {status.tasks && status.tasks.length > 0 && (
            <div className="border-b border-[var(--color-surface-700)]">
              <Button variant="secondary" size="sm" aria-expanded={expandedSections.tasks === true} onClick={() => toggleSection('tasks')} className="w-full justify-start text-left">
                {expandedSections.tasks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Layers size={14} className="text-[var(--color-accent-blue)]" />
                <span className="text-[var(--color-surface-200)]">{t('deploy.row.tasks')}</span>
                <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                  {status.tasks.length}
                </span>
              </Button>
              
              {expandedSections.tasks && (
                <div className="px-2 pb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--color-surface-400)]">
                        <th className="text-left px-2 py-1">{t('controller.id')}</th>
                        <th className="text-left px-2 py-1">{t('controller.pri')}</th>
                        <th className="text-right px-2 py-1">{t('controller.interval')}</th>
                        <th className="text-right px-2 py-1">{t('console.cycles')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.tasks.map((task, idx) => (
                        <tr 
                          key={idx}
                          className="hover:bg-[var(--color-surface-700)]"
                        >
                          <td className="px-2 py-1 text-[var(--color-surface-200)]">
                            {task.id}
                          </td>
                          <td className="px-2 py-1 text-[var(--color-surface-300)]">
                            {task.prio}
                          </td>
                          <td className="px-2 py-1 text-right text-[var(--color-surface-300)]">
                            {t('controller.ms', { value: (task.interval_us / 1000).toFixed(0) })}
                          </td>
                          <td className="px-2 py-1 text-right text-[var(--color-surface-200)]">
                            {task.cycles.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="border-b border-[var(--color-surface-700)]">
            <Button variant="secondary" size="sm" aria-expanded={expandedSections.communication === true} onClick={() => toggleSection('communication')} className="w-full justify-start text-left">
              {expandedSections.communication ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Radio size={14} className="text-[var(--color-accent-green)]" />
              <span className="text-[var(--color-surface-200)]">{t('navigator.group.communication')}</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                {communicationMap.length}
              </span>
            </Button>

            {expandedSections.communication && (
              <div className="px-2 pb-2 space-y-2">
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void connectionManager.refreshCommunicationMap()}>
                    {t('controller.refreshMap')}
                  </Button>
                </div>

                {communicationMap.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--color-surface-400)]">
                    {t('controller.noRuntimeCommunicationBindings')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {communicationMap.map((entry) => (
                      <div key={entry.index} className="rounded border border-[var(--color-surface-700)] p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[var(--color-surface-200)]">#{entry.index}</span>
                          <span className="rounded bg-[var(--color-surface-700)] px-1.5 py-0.5 uppercase text-[11px] text-[var(--text-secondary)]">
                            {entry.kind}
                          </span>
                          <span className="text-[var(--color-surface-400)]">{entry.type}</span>
                          <span className="text-[var(--color-surface-500)]">{t('controller.x', { width: entry.width })}</span>
                          <span className="ml-auto font-mono text-[var(--color-surface-400)]">{t('console.0x', { value: entry.var_addr.toString(16).padStart(4, '0') })}</span>
                        </div>

                        {entry.kind === 'modbus' ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[var(--color-surface-500)]">
                              {t('controller.serverMap', { effective_value: entry.effective_value, value: entry.width > 1 ? `-${entry.effective_value + entry.width - 1}` : '' })}
                            </span>
                            <NumberField aria-label={t('controller.overrideValueOfBinding', { index: entry.index })} min={1} max={65535 - entry.width + 1} value={modbusDrafts[entry.index] ?? String(entry.effective_value)} onChange={(e) => setModbusDrafts((prev) => ({ ...prev, [entry.index]: e.target.value }))} className="w-24" />
                            <Button variant="primary" size="sm" onClick={() => void applyModbusOverride(entry)}>
                              {t('controller.apply')}
                            </Button>
                            {entry.override && (
                              <Button variant="ghost" size="sm" onClick={() => void clearModbusOverride(entry)}>
                                {t('controller.clearOverride')}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-[var(--color-surface-400)]">
                            {t('controller.value', { effective_value: entry.effective_value })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-b border-[var(--color-surface-700)]">
            <Button variant="secondary" size="sm" aria-expanded={expandedSections.mqtt === true} onClick={() => toggleSection('mqtt')} className="w-full justify-start text-left">
              {expandedSections.mqtt ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Radio size={14} className="text-[var(--color-accent-blue)]" />
              <span className="text-[var(--color-surface-200)]">{t('controller.mqttRuntime')}</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                {mqttStatus?.connected ? t('controller.online') : t('controller.offline')}
              </span>
            </Button>

            {expandedSections.mqtt && mqttStatus && (
              <div className="px-4 pb-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('mqtt.broker')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.broker || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('mqtt.clientId')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.client_id || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('mqtt.profile')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.profile}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.protocol')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.protocol === 0 ? '3.1.1' : '5.0'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('mqtt.transport')}</span><span className="text-[var(--color-surface-200)]">{['tcp', 'tls', 'ws', 'wss'][mqttStatus.transport] ?? mqttStatus.transport}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.qos')}</span><span className="text-[var(--color-surface-200)]">{t('controller.pubSub', { publish_qos: mqttStatus.publish_qos, subscribe_qos: mqttStatus.subscribe_qos })}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.session')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.session_present ? t('controller.present') : t('controller.new')}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.flags')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.retain_enabled ? t('controller.retain') : ''}{mqttStatus.lwt_enabled ? t('controller.lwt') : t('controller.plain')}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.lastError')}</span><span className="text-[var(--color-surface-200)]">{mqttStatus.last_error}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.lastPublish')}</span><span className="text-[var(--color-surface-200)]">{t('controller.ms2', { last_publish_ms: mqttStatus.last_publish_ms })}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">{t('controller.backOff')}</span><span className="text-[var(--color-surface-200)]">{t('controller.s', { reconnect_backoff_s: mqttStatus.reconnect_backoff_s })}</span></div>
              </div>
            )}
          </div>

          {/* Memory Section */}
          <div className="border-b border-[var(--color-surface-700)]">
            <Button variant="secondary" size="sm" aria-expanded={expandedSections.memory === true} onClick={() => toggleSection('memory')} className="w-full justify-start text-left">
              {expandedSections.memory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <HardDrive size={14} className="text-[var(--color-accent-yellow)]" />
              <span className="text-[var(--color-surface-200)]">{t('controller.memory')}</span>
            </Button>
            
            {expandedSections.memory && systemInfo && (
              <div className="px-4 pb-3 space-y-2 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[var(--color-surface-400)]">{t('controller.workMemory')}</span>
                    <span className="text-[var(--color-surface-200)]">
                      {formatBytes(systemInfo.memory.work_size)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface-700)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--color-accent-blue)]" 
                      style={{ width: '25%' }} 
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[var(--color-surface-400)]">{t('controller.retainMemory')}</span>
                    <span className="text-[var(--color-surface-200)]">
                      {formatBytes(systemInfo.memory.retain_size)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface-700)] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[var(--color-accent-purple)]" 
                      style={{ width: '10%' }} 
                    />
                  </div>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-[var(--color-surface-400)]">{t('controller.ipiSize')}</span>
                  <span className="text-[var(--color-surface-200)]">
                    {formatBytes(systemInfo.memory.ipi_size)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-surface-400)]">{t('controller.opiSize')}</span>
                  <span className="text-[var(--color-surface-200)]">
                    {formatBytes(systemInfo.memory.opi_size)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* I/O Preview Section */}
          <div className="border-b border-[var(--color-surface-700)]">
            <Button variant="secondary" size="sm" aria-expanded={expandedSections.io === true} onClick={() => toggleSection('io')} className="w-full justify-start text-left">
              {expandedSections.io ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Activity size={14} className="text-[var(--color-accent-green)]" />
              <span className="text-[var(--color-surface-200)]">{t('controller.iOPreview')}</span>
            </Button>
            
            {expandedSections.io && status.opi && (
              <div className="px-4 pb-3 text-xs">
                <div className="mb-2 text-[var(--color-surface-400)]">{t('controller.opiFirst8Bytes')}</div>
                <div className="flex gap-1 flex-wrap">
                  {status.opi.slice(0, 8).map((byte, idx) => (
                    <SignalValue
                      key={idx}
                      tone={byte > 0 ? 'true' : 'false'}
                      className="h-6 min-w-12 px-1 inline-flex items-center justify-center rounded font-mono bg-[var(--color-surface-700)]"
                    >
                      {byte.toString(16).padStart(2, '0').toUpperCase()}
                    </SignalValue>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Last update time */}
      {lastUpdateTime && (
        <div className="px-4 py-2 text-xs text-[var(--color-surface-500)] flex items-center gap-1">
          <Clock size={10} />
          <span>{t('controller.updated', { value: lastUpdateTime.toLocaleTimeString() })}</span>
        </div>
      )}
    </div>
  );
}
