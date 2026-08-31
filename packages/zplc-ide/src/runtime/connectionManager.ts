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
import {
  DeviceAdmissionError,
  DEVICE_ADMISSION_CODE,
  parseDeviceHandshake,
  validateHardwareDeployAdmission,
} from './deviceHandshake';

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
export class ConnectionManager {
  private adapter: SerialAdapter | null = null;
  private generation = 0;
  private connectPromise: Promise<void> | null = null;
  private disconnectPromise: Promise<void> | null = null;
  private connectionPublished = false;
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
    return this.connectionPublished && (this.adapter?.connected ?? false);
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

  private isCurrent(generation: number, adapter: SerialAdapter): boolean {
    return this.generation === generation && this.adapter === adapter;
  }

  private clearConnectionState(): void {
    this.stopPolling();
    this._systemInfo = null;
    this._status = null;
    this._runtimeSnapshot = null;
    this._communicationMap = [];
    this._mqttStatus = null;
    this._passthroughMode = false;
    this.notifyCommunicationMap(this._communicationMap);
    this.notifyMqttStatus(this._mqttStatus);
  }

  private publishDisconnected(): void {
    if (!this.connectionPublished) {
      return;
    }
    this.connectionPublished = false;
    this.notifyConnectionChange(false);
  }

  private handleUnexpectedDisconnect = (adapter: SerialAdapter): void => {
    if (adapter !== this.adapter) {
      return;
    }
    this.generation += 1;
    this.adapter = null;
    this.clearConnectionState();
    this.publishDisconnected();
  };

  /** Connect to a device. Concurrent callers share one physical attempt. */
  connect(): Promise<void> {
    if (this.connected) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const attempt = (async () => {
      if (this.disconnectPromise) {
        await this.disconnectPromise;
      }

      const generation = ++this.generation;
      const adapter = this.adapter ?? new SerialAdapter(this.handleUnexpectedDisconnect);
      adapter.disableAutoPolling = true;
      this.adapter = adapter;

      try {
        await adapter.connect();
        if (!this.isCurrent(generation, adapter)) {
          throw new Error('Connection attempt cancelled');
        }

        this.connectionPublished = true;
        this.notifyConnectionChange(true);

        try {
          const systemInfo = await adapter.getSystemInfo();
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          this._systemInfo = systemInfo;
          this.notifySystemInfo(systemInfo);
        } catch (error) {
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          console.error('Failed to fetch system info:', error);
        }

        try {
          const communicationMap = await adapter.getCommunicationMap();
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          this._communicationMap = communicationMap;
          this.notifyCommunicationMap(communicationMap);
        } catch (error) {
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          console.error('Failed to fetch communication map:', error);
        }

        try {
          const mqttStatus = await adapter.getMqttStatus();
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          this._mqttStatus = mqttStatus;
          this.notifyMqttStatus(mqttStatus);
        } catch (error) {
          if (!this.isCurrent(generation, adapter)) throw new Error('Connection attempt cancelled');
          console.error('Failed to fetch MQTT status:', error);
        }

        if (!this.isCurrent(generation, adapter)) {
          throw new Error('Connection attempt cancelled');
        }
        if (!this._passthroughMode) {
          this.startPolling(generation, adapter);
        }
      } catch (error) {
        if (this.isCurrent(generation, adapter)) {
          this.adapter = null;
          this.clearConnectionState();
          this.publishDisconnected();
          try {
            await adapter.disconnect();
          } catch (disconnectError) {
            console.warn('[ConnectionManager] Error cleaning up failed connection:', disconnectError);
          }
          throw error;
        }
        throw new Error('Connection attempt cancelled');
      }
    })();

    this.connectPromise = attempt;
    void attempt.then(
      () => { if (this.connectPromise === attempt) this.connectPromise = null; },
      () => { if (this.connectPromise === attempt) this.connectPromise = null; },
    );
    return attempt;
  }

  /** Disconnect from device. Concurrent callers share one physical close. */
  disconnect(): Promise<void> {
    if (this.disconnectPromise) {
      return this.disconnectPromise;
    }

    this.generation += 1;
    const adapter = this.adapter;
    const pendingConnect = this.connectPromise;
    this.connectPromise = null;
    this.adapter = null;
    this.clearConnectionState();
    this.publishDisconnected();

    const attempt = (async () => {
      let disconnectFailed = false;
      let disconnectError: unknown;
      try {
        await adapter?.disconnect();
      } catch (error) {
        disconnectFailed = true;
        disconnectError = error;
        console.warn('[ConnectionManager] Error during adapter disconnect:', error);
      }
      if (pendingConnect) {
        await pendingConnect.catch(() => undefined);
      }
      if (disconnectFailed) {
        throw disconnectError;
      }
    })();

    this.disconnectPromise = attempt;
    void attempt.then(
      () => { if (this.disconnectPromise === attempt) this.disconnectPromise = null; },
      () => { if (this.disconnectPromise === attempt) this.disconnectPromise = null; },
    );
    return attempt;
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

  private startPolling(generation = this.generation, adapter = this.adapter): void {
    if (this.pollInterval !== null || this._passthroughMode || !adapter) {
      return;
    }

    // Start polling after a short delay to let serial buffer settle
    // Don't poll immediately to avoid conflicts with recent commands
    this.pollInterval = setInterval(() => {
      void this.poll(generation, adapter);
    }, this.POLL_INTERVAL);
  }

  private stopPolling(): void {
    if (this.pollInterval !== null) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async poll(generation: number, adapter: SerialAdapter): Promise<void> {
    if (!this.isCurrent(generation, adapter) || !this.connected || this._passthroughMode) {
      return;
    }

    try {
      const status = await adapter.getStatus();
      if (!this.isCurrent(generation, adapter) || this._passthroughMode) return;
      this._status = status;
      this.notifyStatus(status);
      const runtimeSnapshot = await adapter.getRuntimeSnapshot();
      if (!this.isCurrent(generation, adapter) || this._passthroughMode) return;
      this._runtimeSnapshot = runtimeSnapshot;
      this.notifyRuntimeSnapshot(runtimeSnapshot);
      const mqttStatus = await adapter.getMqttStatus();
      if (!this.isCurrent(generation, adapter) || this._passthroughMode) return;
      this._mqttStatus = mqttStatus;
      this.notifyMqttStatus(mqttStatus);
    } catch (e) {
      // Silently ignore poll errors
      console.debug('Poll error:', e);
    }
  }

  /**
   * Force a refresh of system info
   */
  async refreshSystemInfo(): Promise<SystemInfo | null> {
    const adapter = this.adapter;
    const generation = this.generation;
    if (!adapter?.connected) {
      return null;
    }

    try {
      const systemInfo = await adapter.getSystemInfo();
      if (!this.isCurrent(generation, adapter)) {
        return null;
      }
      this._systemInfo = systemInfo;
      this.notifySystemInfo(systemInfo);
      return systemInfo;
    } catch (e) {
      if (!this.isCurrent(generation, adapter)) {
        return null;
      }
      console.error('Failed to refresh system info:', e);
      return null;
    }
  }

  async refreshCommunicationMap(): Promise<CommunicationMapEntry[]> {
    const adapter = this.adapter;
    const generation = this.generation;
    if (!adapter?.connected) {
      return [];
    }

    try {
      const communicationMap = await adapter.getCommunicationMap();
      if (!this.isCurrent(generation, adapter)) {
        return [];
      }
      this._communicationMap = communicationMap;
      this.notifyCommunicationMap(communicationMap);
      return communicationMap;
    } catch (e) {
      if (!this.isCurrent(generation, adapter)) {
        return [];
      }
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
  async deployProgram(
    bytecode: Uint8Array,
    projectBoard: string | undefined,
    options?: LoadProgramOptions,
  ): Promise<void> {
    const adapter = this.adapter;
    const generation = this.generation;
    if (!adapter || !this.connected) {
      throw new DeviceAdmissionError(DEVICE_ADMISSION_CODE.PREFLIGHT_STALE);
    }

    const handshake = parseDeviceHandshake(this._systemInfo);
    validateHardwareDeployAdmission(bytecode, projectBoard, handshake);
    if (!this.isCurrent(generation, adapter) || !this.connected) {
      throw new DeviceAdmissionError(DEVICE_ADMISSION_CODE.PREFLIGHT_STALE);
    }

    try {
      await adapter.loadProgram(bytecode, options);
    } catch {
      throw new DeviceAdmissionError(DEVICE_ADMISSION_CODE.RESULT_UNKNOWN);
    }
    if (!this.isCurrent(generation, adapter) || !this.connected) {
      throw new DeviceAdmissionError(DEVICE_ADMISSION_CODE.RESULT_UNKNOWN);
    }
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
