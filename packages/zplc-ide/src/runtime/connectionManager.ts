/**
 * @file connectionManager.ts
 * @brief Global Serial Connection Manager for ZPLC IDE
 * 
 * Manages a single shared SerialAdapter instance that can be used by:
 * - Toolbar (connect/disconnect, upload)
 * - Terminal (shell commands)
 * - ControllerView (status polling)
 * 
 * Implements passthrough mode to pause polling when terminal is active.
 */

import { SerialAdapter } from './serialAdapter';
import type { CommunicationMapEntry, MqttRuntimeStatus, SystemInfo, StatusInfo } from './serialAdapter';
import type { ZPLCProjectConfig } from '../types';
import type { LoadProgramOptions, RuntimeSnapshot } from './debugAdapter';
import type { UploadTraceCallback } from './uploadTrace';

/** Connection state change callback */
export type ConnectionCallback = (connected: boolean) => void;

/** Status update callback */
export type StatusCallback = (status: StatusInfo) => void;
export type RuntimeSnapshotCallback = (snapshot: RuntimeSnapshot) => void;

/** System info update callback */
export type SystemInfoCallback = (info: SystemInfo) => void;

/** Communication map update callback */
export type CommunicationMapCallback = (entries: CommunicationMapEntry[]) => void;
export type MqttStatusCallback = (status: MqttRuntimeStatus | null) => void;

/**
 * Global connection manager singleton
 */
class ConnectionManager {
  private adapter: SerialAdapter | null = null;
  private _passthroughMode = false;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  
  // Callbacks
  private connectionCallbacks: Set<ConnectionCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private runtimeSnapshotCallbacks: Set<RuntimeSnapshotCallback> = new Set();
  private systemInfoCallbacks: Set<SystemInfoCallback> = new Set();
  private communicationMapCallbacks: Set<CommunicationMapCallback> = new Set();
  private mqttStatusCallbacks: Set<MqttStatusCallback> = new Set();
  
  // Cached state
  private _systemInfo: SystemInfo | null = null;
  private _status: StatusInfo | null = null;
  private _runtimeSnapshot: RuntimeSnapshot | null = null;
  private _communicationMap: CommunicationMapEntry[] = [];
  private _mqttStatus: MqttRuntimeStatus | null = null;

  /** Poll interval in ms */
  private readonly POLL_INTERVAL = 1000;

  // =========================================================================
  // Connection Management
  // =========================================================================

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.adapter?.connected ?? false;
  }

  /**
   * Get passthrough mode state
   */
  get passthroughMode(): boolean {
    return this._passthroughMode;
  }

  /**
   * Get cached system info
   */
  get systemInfo(): SystemInfo | null {
    return this._systemInfo;
  }

  /**
   * Get cached status
   */
  get status(): StatusInfo | null {
    return this._status;
  }

  get runtimeSnapshot(): RuntimeSnapshot | null {
    return this._runtimeSnapshot;
  }

  get communicationMap(): CommunicationMapEntry[] {
    return this._communicationMap;
  }

  get mqttStatus(): MqttRuntimeStatus | null {
    return this._mqttStatus;
  }

  /**
   * Get the adapter instance (for terminal/upload)
   */
  get serialAdapter(): SerialAdapter | null {
    return this.adapter;
  }

  /**
   * Connect to a device
   */
  async connect(): Promise<void> {
    if (this.adapter?.connected) {
      return;
    }

    // Create adapter if needed
    if (!this.adapter) {
      this.adapter = new SerialAdapter();
      // Disable auto-polling - connectionManager will handle polling
      this.adapter.disableAutoPolling = true;
    }

    await this.adapter.connect();
    
    // Notify subscribers
    this.notifyConnectionChange(true);

    // Fetch system info once
    try {
      this._systemInfo = await this.adapter.getSystemInfo();
      this.notifySystemInfo(this._systemInfo);
    } catch (e) {
      console.error('Failed to fetch system info:', e);
    }

    try {
      this._communicationMap = await this.adapter.getCommunicationMap();
      this.notifyCommunicationMap(this._communicationMap);
    } catch (e) {
      console.error('Failed to fetch communication map:', e);
    }

    try {
      this._mqttStatus = await this.adapter.getMqttStatus();
      this.notifyMqttStatus(this._mqttStatus);
    } catch (e) {
      console.error('Failed to fetch MQTT status:', e);
    }

    // Start polling if not in passthrough mode
    if (!this._passthroughMode) {
      this.startPolling();
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    console.log('[ConnectionManager] disconnect called');
    this.stopPolling();
    
    if (this.adapter) {
      try {
        await this.adapter.disconnect();
      } catch (err) {
        console.warn('[ConnectionManager] Error during adapter disconnect:', err);
      }
      this.adapter = null;
    }
    
    this._systemInfo = null;
    this._status = null;
    this._runtimeSnapshot = null;
    this._communicationMap = [];
    this._mqttStatus = null;
    this._passthroughMode = false;
    
    // Notify subscribers
    this.notifyConnectionChange(false);
    this.notifyCommunicationMap(this._communicationMap);
    this.notifyMqttStatus(this._mqttStatus);
    console.log('[ConnectionManager] disconnect complete');
  }

  // =========================================================================
  // Passthrough Mode (for Terminal)
  // =========================================================================

  /**
   * Enable passthrough mode - pauses polling for terminal use
   */
  enablePassthrough(): void {
    this._passthroughMode = true;
    this.stopPolling();
    
    if (this.adapter) {
      this.adapter.setPassthroughMode(true);
    }
  }

  /**
   * Disable passthrough mode - resumes polling
   */
  disablePassthrough(): void {
    this._passthroughMode = false;
    
    if (this.adapter) {
      this.adapter.setPassthroughMode(false);
    }
    
    if (this.connected) {
      this.startPolling();
    }
  }

  // =========================================================================
  // Polling Control (for operations that need exclusive serial access)
  // =========================================================================

  /**
   * Pause polling temporarily for serial operations.
   * This pauses BOTH connectionManager and SerialAdapter polling.
   * Call resumePolling() when done.
   */
  pausePolling(): void {
    this.stopPolling();
    // Also stop the adapter's internal polling
    if (this.adapter) {
      this.adapter.setPassthroughMode(true);
    }
  }

  /**
   * Resume polling after pausePolling().
   * Only resumes if not in passthrough mode.
   */
  resumePolling(): void {
    // Resume adapter polling first
    if (this.adapter && !this._passthroughMode) {
      this.adapter.setPassthroughMode(false);
    }
    if (!this._passthroughMode && this.connected) {
      this.startPolling();
    }
  }

  // =========================================================================
  // Data Access (for Terminal)
  // =========================================================================

  /**
   * Send raw data (for terminal)
   */
  async sendRaw(data: string): Promise<void> {
    if (!this.adapter) {
      throw new Error('Not connected');
    }
    await this.adapter.sendRaw(data);
  }

  /**
   * Get receive buffer (for terminal)
   */
  getRxBuffer(): string {
    return this.adapter?.getRxBuffer() ?? '';
  }

  /**
   * Clear receive buffer
   */
  clearRxBuffer(): void {
    this.adapter?.clearRxBuffer();
  }

  // =========================================================================
  // Status Polling
  // =========================================================================

  private startPolling(): void {
    if (this.pollInterval !== null || this._passthroughMode) {
      return;
    }

    // Start polling after a short delay to let serial buffer settle
    // Don't poll immediately to avoid conflicts with recent commands
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.adapter?.connected || this._passthroughMode) {
      return;
    }

    try {
      this._status = await this.adapter.getStatus();
      this.notifyStatus(this._status);
      this._runtimeSnapshot = await this.adapter.getRuntimeSnapshot();
      this.notifyRuntimeSnapshot(this._runtimeSnapshot);
      this._mqttStatus = await this.adapter.getMqttStatus();
      this.notifyMqttStatus(this._mqttStatus);
    } catch (e) {
      // Silently ignore poll errors
      console.debug('Poll error:', e);
    }
  }

  /**
   * Force a refresh of system info
   */
  async refreshSystemInfo(): Promise<SystemInfo | null> {
    if (!this.adapter?.connected) {
      return null;
    }

    try {
      this._systemInfo = await this.adapter.getSystemInfo();
      this.notifySystemInfo(this._systemInfo);
      return this._systemInfo;
    } catch (e) {
      console.error('Failed to refresh system info:', e);
      return null;
    }
  }

  async refreshCommunicationMap(): Promise<CommunicationMapEntry[]> {
    if (!this.adapter?.connected) {
      return [];
    }

    try {
      this._communicationMap = await this.adapter.getCommunicationMap();
      this.notifyCommunicationMap(this._communicationMap);
      return this._communicationMap;
    } catch (e) {
      console.error('Failed to refresh communication map:', e);
      return this._communicationMap;
    }
  }

  async setModbusAddress(index: number, address: number): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }

    await this.adapter.setModbusAddress(index, address);
    await this.refreshCommunicationMap();
  }

  async clearModbusAddress(index: number): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }

    await this.adapter.clearModbusAddress(index);
    await this.refreshCommunicationMap();
  }

  // =========================================================================
  // Subscription Management
  // =========================================================================

  /**
   * Subscribe to connection state changes
   */
  onConnectionChange(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    // Immediately notify current state
    callback(this.connected);
    return () => this.connectionCallbacks.delete(callback);
  }

  /**
   * Subscribe to status updates
   */
  onStatusUpdate(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    // Immediately notify if we have cached data
    if (this._status) {
      callback(this._status);
    }
    return () => this.statusCallbacks.delete(callback);
  }

  onRuntimeSnapshotUpdate(callback: RuntimeSnapshotCallback): () => void {
    this.runtimeSnapshotCallbacks.add(callback);
    if (this._runtimeSnapshot) {
      callback(this._runtimeSnapshot);
    }
    return () => this.runtimeSnapshotCallbacks.delete(callback);
  }

  /**
   * Subscribe to system info updates
   */
  onSystemInfoUpdate(callback: SystemInfoCallback): () => void {
    this.systemInfoCallbacks.add(callback);
    // Immediately notify if we have cached data
    if (this._systemInfo) {
      callback(this._systemInfo);
    }
    return () => this.systemInfoCallbacks.delete(callback);
  }

  onCommunicationMapUpdate(callback: CommunicationMapCallback): () => void {
    this.communicationMapCallbacks.add(callback);
    callback(this._communicationMap);
    return () => this.communicationMapCallbacks.delete(callback);
  }

  onMqttStatusUpdate(callback: MqttStatusCallback): () => void {
    this.mqttStatusCallbacks.add(callback);
    callback(this._mqttStatus);
    return () => this.mqttStatusCallbacks.delete(callback);
  }

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(cb => cb(connected));
  }

  private notifyStatus(status: StatusInfo): void {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  private notifyRuntimeSnapshot(snapshot: RuntimeSnapshot): void {
    this.runtimeSnapshotCallbacks.forEach(cb => cb(snapshot));
  }

  private notifySystemInfo(info: SystemInfo): void {
    this.systemInfoCallbacks.forEach(cb => cb(info));
  }

  private notifyCommunicationMap(entries: CommunicationMapEntry[]): void {
    this.communicationMapCallbacks.forEach(cb => cb(entries));
  }

  private notifyMqttStatus(status: MqttRuntimeStatus | null): void {
    this.mqttStatusCallbacks.forEach(cb => cb(status));
  }

  // =========================================================================
  // Upload (delegates to adapter)
  // =========================================================================

  async provisionProjectConfig(config: ZPLCProjectConfig, trace?: UploadTraceCallback): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }

    await this.adapter.provisionProjectConfig(config, trace);
  }

  /**
   * Triggers WiFi / network bring-up after the program is loaded.
   * Best-effort: never throws. Call without await to keep it non-blocking.
   */
  async triggerNetworkBringUp(config: ZPLCProjectConfig): Promise<void> {
    if (!this.adapter?.connected) {
      return;
    }
    await this.adapter.triggerNetworkBringUp(config);
  }

  /**
   * Upload bytecode to device
   * NOTE: Caller should use pausePolling()/resumePolling() to manage polling
   */
  async uploadBytecode(bytecode: Uint8Array, options?: LoadProgramOptions): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }
    
    await this.adapter.loadProgram(bytecode, options);
    await this.refreshCommunicationMap();
  }

  /**
   * Start PLC execution
   */
  async start(): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }
    await this.adapter.start();
  }

  /**
   * Stop PLC execution
   */
  async stop(): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }
    await this.adapter.stop();
  }

  /**
   * Reset PLC
   */
  async reset(): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }
    await this.adapter.reset();
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
