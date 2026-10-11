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
import { connectionManager } from '../runtime/connectionManager';
import type { CommunicationMapEntry, MqttRuntimeStatus, SystemInfo, StatusInfo } from '../runtime/serialAdapter';
import { Button, NumberField } from '../ui';

export function ControllerView() {
  // State from connection manager
  const [isConnected, setIsConnected] = useState(connectionManager.connected);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(connectionManager.systemInfo);
  const [status, setStatus] = useState<StatusInfo | null>(connectionManager.status);
  const [communicationMap, setCommunicationMap] = useState<CommunicationMapEntry[]>(connectionManager.communicationMap);
  const [mqttStatus, setMqttStatus] = useState<MqttRuntimeStatus | null>(connectionManager.mqttStatus);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
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

    return () => {
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
          No device connected
        </p>
        <p className="text-xs text-[var(--color-surface-400)] mt-1">
          Use Toolbar → Connect
        </p>
      </div>
    );
  }

  // Loading state
  if (!systemInfo && !status) {
    return (
      <div className="p-4 text-center">
        <RefreshCw size={24} className="mx-auto mb-2 text-[var(--color-accent-blue)] animate-spin" />
        <p className="text-sm text-[var(--color-surface-300)]">
          Fetching device info...
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
          {systemInfo?.board || 'ZPLC Device'}
        </span>
        {!connectionManager.passthroughMode && (
          <Activity size={12} className="ml-auto text-[var(--color-accent-blue)] animate-pulse" />
        )}
        {connectionManager.passthroughMode && (
          <span className="ml-auto text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]">
            terminal
          </span>
        )}
      </div>

      {/* Device Info Section */}
      <div className="border-b border-[var(--color-surface-700)]">
        <Button variant="secondary" size="sm" aria-expanded={expandedSections.info === true} onClick={() => toggleSection('info')} className="w-full justify-start text-left">
          {expandedSections.info ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Cpu size={14} className="text-[var(--color-accent-purple)]" />
          <span className="text-[var(--color-surface-200)]">Device Info</span>
        </Button>
        
        {expandedSections.info && systemInfo && (
          <div className="px-4 pb-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">ZPLC Version</span>
              <span className="text-[var(--color-surface-200)]">{systemInfo.zplc_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">Zephyr</span>
              <span className="text-[var(--color-surface-200)]">{systemInfo.zephyr_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">CPU Freq</span>
              <span className="text-[var(--color-surface-200)]">{systemInfo.cpu_freq_mhz} MHz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-surface-400)]">Uptime</span>
              <span className="text-[var(--color-surface-200)]">
                {formatUptime(status?.uptime_ms || systemInfo.uptime_ms)}
              </span>
            </div>
            {/* Capabilities */}
            <div className="flex gap-1 mt-2">
              {systemInfo.capabilities.fpu && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-purple)] text-[var(--color-on-accent)] rounded text-xs">
                  FPU
                </span>
              )}
              {systemInfo.capabilities.scheduler && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-blue)] text-[var(--color-on-accent)] rounded text-xs">
                  MT
                </span>
              )}
              {systemInfo.capabilities.mpu && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-green)] text-[var(--color-on-accent)] rounded text-xs">
                  MPU
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
            <div className={`w-2.5 h-2.5 rounded-full ${
              status.state === 'RUNNING' 
                ? 'bg-[var(--color-accent-green)] animate-pulse'
                : status.state === 'IDLE'
                  ? 'bg-[var(--color-accent-yellow)]'
                  : 'bg-[var(--color-surface-500)]'
            }`} />
            <span className="text-xs font-medium text-[var(--color-surface-200)] uppercase">
              {status.state || 'UNKNOWN'}
            </span>
            <span className="ml-auto text-xs text-[var(--color-surface-400)]">
              {(status.stats?.cycles ?? 0).toLocaleString()} cycles
            </span>
          </div>

          {/* Tasks Section */}
          {status.tasks && status.tasks.length > 0 && (
            <div className="border-b border-[var(--color-surface-700)]">
              <Button variant="secondary" size="sm" aria-expanded={expandedSections.tasks === true} onClick={() => toggleSection('tasks')} className="w-full justify-start text-left">
                {expandedSections.tasks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Layers size={14} className="text-[var(--color-accent-blue)]" />
                <span className="text-[var(--color-surface-200)]">Tasks</span>
                <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                  {status.tasks.length}
                </span>
              </Button>
              
              {expandedSections.tasks && (
                <div className="px-2 pb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[var(--color-surface-400)]">
                        <th className="text-left px-2 py-1">ID</th>
                        <th className="text-left px-2 py-1">Pri</th>
                        <th className="text-right px-2 py-1">Interval</th>
                        <th className="text-right px-2 py-1">Cycles</th>
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
                            {(task.interval_us / 1000).toFixed(0)}ms
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
              <span className="text-[var(--color-surface-200)]">Communication</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                {communicationMap.length}
              </span>
            </Button>

            {expandedSections.communication && (
              <div className="px-2 pb-2 space-y-2">
                <div className="flex justify-end">
                  <Button variant="secondary" size="sm" onClick={() => void connectionManager.refreshCommunicationMap()}>
                    Refresh map
                  </Button>
                </div>

                {communicationMap.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-[var(--color-surface-400)]">
                    No runtime communication bindings loaded.
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
                          <span className="text-[var(--color-surface-500)]">x{entry.width}</span>
                          <span className="ml-auto font-mono text-[var(--color-surface-400)]">0x{entry.var_addr.toString(16).padStart(4, '0')}</span>
                        </div>

                        {entry.kind === 'modbus' ? (
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-[var(--color-surface-500)]">
                              Server map {entry.effective_value}{entry.width > 1 ? `-${entry.effective_value + entry.width - 1}` : ''}
                            </span>
                            <NumberField aria-label={`Override value of binding ${entry.index}`} min={1} max={65535 - entry.width + 1} value={modbusDrafts[entry.index] ?? String(entry.effective_value)} onChange={(e) => setModbusDrafts((prev) => ({ ...prev, [entry.index]: e.target.value }))} className="w-24" />
                            <Button variant="primary" size="sm" onClick={() => void applyModbusOverride(entry)}>
                              Apply
                            </Button>
                            {entry.override && (
                              <Button variant="ghost" size="sm" onClick={() => void clearModbusOverride(entry)}>
                                Clear override
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2 text-[var(--color-surface-400)]">
                            Value: {entry.effective_value}
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
              <span className="text-[var(--color-surface-200)]">MQTT Runtime</span>
              <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                {mqttStatus?.connected ? 'online' : 'offline'}
              </span>
            </Button>

            {expandedSections.mqtt && mqttStatus && (
              <div className="px-4 pb-3 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Broker</span><span className="text-[var(--color-surface-200)]">{mqttStatus.broker || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Client ID</span><span className="text-[var(--color-surface-200)]">{mqttStatus.client_id || '-'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Profile</span><span className="text-[var(--color-surface-200)]">{mqttStatus.profile}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Protocol</span><span className="text-[var(--color-surface-200)]">{mqttStatus.protocol === 0 ? '3.1.1' : '5.0'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Transport</span><span className="text-[var(--color-surface-200)]">{['tcp', 'tls', 'ws', 'wss'][mqttStatus.transport] ?? mqttStatus.transport}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">QoS</span><span className="text-[var(--color-surface-200)]">pub {mqttStatus.publish_qos} / sub {mqttStatus.subscribe_qos}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Session</span><span className="text-[var(--color-surface-200)]">{mqttStatus.session_present ? 'present' : 'new'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Flags</span><span className="text-[var(--color-surface-200)]">{mqttStatus.retain_enabled ? 'retain ' : ''}{mqttStatus.lwt_enabled ? 'lwt' : 'plain'}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Last Error</span><span className="text-[var(--color-surface-200)]">{mqttStatus.last_error}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Last Publish</span><span className="text-[var(--color-surface-200)]">{mqttStatus.last_publish_ms} ms</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-surface-400)]">Backoff</span><span className="text-[var(--color-surface-200)]">{mqttStatus.reconnect_backoff_s}s</span></div>
              </div>
            )}
          </div>

          {/* Memory Section */}
          <div className="border-b border-[var(--color-surface-700)]">
            <Button variant="secondary" size="sm" aria-expanded={expandedSections.memory === true} onClick={() => toggleSection('memory')} className="w-full justify-start text-left">
              {expandedSections.memory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <HardDrive size={14} className="text-[var(--color-accent-yellow)]" />
              <span className="text-[var(--color-surface-200)]">Memory</span>
            </Button>
            
            {expandedSections.memory && systemInfo && (
              <div className="px-4 pb-3 space-y-2 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[var(--color-surface-400)]">Work Memory</span>
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
                    <span className="text-[var(--color-surface-400)]">Retain Memory</span>
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
                  <span className="text-[var(--color-surface-400)]">IPI Size</span>
                  <span className="text-[var(--color-surface-200)]">
                    {formatBytes(systemInfo.memory.ipi_size)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-surface-400)]">OPI Size</span>
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
              <span className="text-[var(--color-surface-200)]">I/O Preview</span>
            </Button>
            
            {expandedSections.io && status.opi && (
              <div className="px-4 pb-3 text-xs">
                <div className="mb-2 text-[var(--color-surface-400)]">OPI (first 8 bytes):</div>
                <div className="flex gap-1 flex-wrap">
                  {status.opi.slice(0, 8).map((byte, idx) => (
                    <div
                      key={idx}
                      className={`w-8 h-6 flex items-center justify-center rounded font-mono ${
                        byte > 0 
                          ? 'bg-[var(--color-accent-green)] text-[var(--color-on-accent)]' 
                          : 'bg-[var(--color-surface-700)] text-[var(--color-surface-300)]'
                      }`}
                    >
                      {byte.toString(16).padStart(2, '0').toUpperCase()}
                    </div>
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
          <span>Updated {lastUpdateTime.toLocaleTimeString()}</span>
        </div>
      )}
    </div>
  );
}
