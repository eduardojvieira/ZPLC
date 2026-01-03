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
import type { SystemInfo, StatusInfo } from './serialAdapter';

/** Connection state change callback */
export type ConnectionCallback = (connected: boolean) => void;

/** Status update callback */
export type StatusCallback = (status: StatusInfo) => void;

/** System info update callback */
export type SystemInfoCallback = (info: SystemInfo) => void;

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
  private systemInfoCallbacks: Set<SystemInfoCallback> = new Set();
  
  // Cached state
  private _systemInfo: SystemInfo | null = null;
  private _status: StatusInfo | null = null;

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

    // Start polling if not in passthrough mode
    if (!this._passthroughMode) {
      this.startPolling();
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    this.stopPolling();
    
    if (this.adapter) {
      await this.adapter.disconnect();
    }
    
    this._systemInfo = null;
    this._status = null;
    
    // Notify subscribers
    this.notifyConnectionChange(false);
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
   * Pause polling temporarily for serial operations
   * Call resumePolling() when done
   */
  pausePolling(): void {
    this.stopPolling();
  }

  /**
   * Resume polling after pausePolling()
   * Only resumes if not in passthrough mode
   */
  resumePolling(): void {
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

  private notifyConnectionChange(connected: boolean): void {
    this.connectionCallbacks.forEach(cb => cb(connected));
  }

  private notifyStatus(status: StatusInfo): void {
    this.statusCallbacks.forEach(cb => cb(status));
  }

  private notifySystemInfo(info: SystemInfo): void {
    this.systemInfoCallbacks.forEach(cb => cb(info));
  }

  // =========================================================================
  // Upload (delegates to adapter)
  // =========================================================================

  /**
   * Upload bytecode to device
   * NOTE: Caller should use pausePolling()/resumePolling() to manage polling
   */
  async uploadBytecode(bytecode: Uint8Array): Promise<void> {
    if (!this.adapter?.connected) {
      throw new Error('Not connected');
    }
    
    await this.adapter.loadProgram(bytecode);
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
