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
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { connectionManager } from '../runtime/connectionManager';
import type { SystemInfo, StatusInfo } from '../runtime/serialAdapter';

export function ControllerView() {
  // State from connection manager
  const [isConnected, setIsConnected] = useState(connectionManager.connected);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(connectionManager.systemInfo);
  const [status, setStatus] = useState<StatusInfo | null>(connectionManager.status);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);
  
  // UI state
  const [expandedSections, setExpandedSections] = useState({
    info: true,
    tasks: true,
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

    return () => {
      unsubConnection();
      unsubSystemInfo();
      unsubStatus();
    };
  }, []);

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
        <p className="text-xs text-[var(--color-surface-500)] mt-1">
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
        <button
          onClick={() => toggleSection('info')}
          className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-surface-700)] text-left"
        >
          {expandedSections.info ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Cpu size={14} className="text-[var(--color-accent-purple)]" />
          <span className="text-[var(--color-surface-200)]">Device Info</span>
        </button>
        
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
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-purple)] text-white rounded text-xs">
                  FPU
                </span>
              )}
              {systemInfo.capabilities.scheduler && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-blue)] text-white rounded text-xs">
                  MT
                </span>
              )}
              {systemInfo.capabilities.mpu && (
                <span className="px-1.5 py-0.5 bg-[var(--color-accent-green)] text-white rounded text-xs">
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
              {status.state}
            </span>
            <span className="ml-auto text-xs text-[var(--color-surface-400)]">
              {status.stats.cycles.toLocaleString()} cycles
            </span>
          </div>

          {/* Tasks Section */}
          {status.tasks && status.tasks.length > 0 && (
            <div className="border-b border-[var(--color-surface-700)]">
              <button
                onClick={() => toggleSection('tasks')}
                className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-surface-700)] text-left"
              >
                {expandedSections.tasks ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <Layers size={14} className="text-[var(--color-accent-blue)]" />
                <span className="text-[var(--color-surface-200)]">Tasks</span>
                <span className="ml-auto text-xs text-[var(--color-surface-400)]">
                  {status.tasks.length}
                </span>
              </button>
              
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

          {/* Memory Section */}
          <div className="border-b border-[var(--color-surface-700)]">
            <button
              onClick={() => toggleSection('memory')}
              className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-surface-700)] text-left"
            >
              {expandedSections.memory ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <HardDrive size={14} className="text-[var(--color-accent-yellow)]" />
              <span className="text-[var(--color-surface-200)]">Memory</span>
            </button>
            
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
            <button
              onClick={() => toggleSection('io')}
              className="flex items-center gap-2 w-full p-2 hover:bg-[var(--color-surface-700)] text-left"
            >
              {expandedSections.io ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Activity size={14} className="text-[var(--color-accent-green)]" />
              <span className="text-[var(--color-surface-200)]">I/O Preview</span>
            </button>
            
            {expandedSections.io && status.opi && (
              <div className="px-4 pb-3 text-xs">
                <div className="mb-2 text-[var(--color-surface-400)]">OPI (first 8 bytes):</div>
                <div className="flex gap-1 flex-wrap">
                  {status.opi.slice(0, 8).map((byte, idx) => (
                    <div
                      key={idx}
                      className={`w-8 h-6 flex items-center justify-center rounded font-mono ${
                        byte > 0 
                          ? 'bg-[var(--color-accent-green)] text-white' 
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
