/**
 * TerminalTab Component
 * 
 * Serial terminal for direct shell access to ZPLC devices.
 * Uses the global connectionManager with passthrough mode to 
 * pause IDE polling when terminal is active.
 * 
 * Features:
 * - Direct shell access (zplc status, zplc dbg info, etc.)
 * - Command history (up/down arrows)
 * - Auto-scroll to bottom
 * - ANSI color code stripping
 * - Passthrough mode (pauses dashboard polling)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Terminal, Trash2, Plug, PlugZap } from 'lucide-react';
import { connectionManager } from '../runtime/connectionManager';
import { isWebSerialSupported } from '../uploader/webserial';

/** Line ending for commands */
const LINE_ENDING = '\r\n';

/** Max lines to keep in terminal buffer */
const MAX_LINES = 500;

/** ANSI escape code regex */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;]*[a-zA-Z]/g;

interface TerminalTabProps {
  /** Whether this tab is currently active */
  isActive: boolean;
}

export function TerminalTab({ isActive }: TerminalTabProps) {
  // Terminal state
  const [lines, setLines] = useState<string[]>(['ZPLC Serial Terminal', 'Use the shared connection from Toolbar', '']);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Connection state (synced with connectionManager)
  const [isConnected, setIsConnected] = useState(connectionManager.connected);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Refs
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const readLoopActiveRef = useRef(false);

  /**
   * Append text to terminal output
   */
  const appendOutput = useCallback((text: string) => {
    // Strip ANSI codes
    const cleanText = text.replace(ANSI_REGEX, '');
    
    setLines(prev => {
      // Split incoming text by newlines and merge with existing lines
      const newLines = cleanText.split(/\r?\n/);
      const updated = [...prev];
      
      // Append first part to last existing line
      if (updated.length > 0 && newLines.length > 0) {
        updated[updated.length - 1] += newLines[0];
        newLines.shift();
      }
      
      // Add remaining lines
      updated.push(...newLines);
      
      // Trim if too many lines
      if (updated.length > MAX_LINES) {
        return updated.slice(-MAX_LINES);
      }
      
      return updated;
    });
  }, []);

  /**
   * Start reading from connection's rx buffer
   */
  const startReading = useCallback(() => {
    if (readLoopActiveRef.current) return;
    
    readLoopActiveRef.current = true;
    
    const pollBuffer = () => {
      if (!readLoopActiveRef.current) return;
      
      // Check if there's data in the buffer
      const buffer = connectionManager.getRxBuffer();
      if (buffer && buffer.length > 0) {
        connectionManager.clearRxBuffer();
        appendOutput(buffer);
      }
      
      // Continue polling
      if (readLoopActiveRef.current) {
        requestAnimationFrame(pollBuffer);
      }
    };
    
    pollBuffer();
  }, [appendOutput]);

  /**
   * Stop reading
   */
  const stopReading = useCallback(() => {
    readLoopActiveRef.current = false;
  }, []);

  /**
   * Connect to serial port via connection manager
   */
  const handleConnect = async () => {
    if (isConnected) {
      // Disconnect
      stopReading();
      try {
        await connectionManager.disconnect();
      } catch (e) {
        console.error('Disconnect error:', e);
      }
      appendOutput('\n[Disconnected]\n');
      return;
    }

    // Connect
    if (!isWebSerialSupported()) {
      appendOutput('\n[ERROR: WebSerial not supported. Use Chrome or Edge.]\n');
      return;
    }

    setIsConnecting(true);
    try {
      appendOutput('\n[Connecting...]\n');
      
      await connectionManager.connect();
      appendOutput('[Connected to ZPLC device]\n');
      appendOutput('[Type "help" for available commands]\n\n');
      
    } catch (e) {
      appendOutput(`[ERROR: ${e instanceof Error ? e.message : String(e)}]\n`);
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Send command to device
   */
  const sendCommand = async (cmd: string) => {
    if (!connectionManager.connected) {
      appendOutput('[Not connected]\n');
      return;
    }

    try {
      await connectionManager.sendRaw(cmd + LINE_ENDING);
      
      // Echo the command
      appendOutput(`$ ${cmd}\n`);
    } catch (e) {
      appendOutput(`[Send error: ${e instanceof Error ? e.message : String(e)}]\n`);
    }
  };

  /**
   * Handle input submission
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const cmd = inputValue.trim();
    if (!cmd) return;
    
    // Add to history
    setCommandHistory(prev => {
      const updated = [...prev.filter(c => c !== cmd), cmd];
      return updated.slice(-50); // Keep last 50 commands
    });
    setHistoryIndex(-1);
    
    // Clear input
    setInputValue('');
    
    // Handle local commands
    if (cmd === 'clear') {
      setLines(['']);
      return;
    }
    
    // Send to device
    sendCommand(cmd);
  };

  /**
   * Handle keyboard navigation
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      
      const newIndex = historyIndex < commandHistory.length - 1 
        ? historyIndex + 1 
        : historyIndex;
      setHistoryIndex(newIndex);
      setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInputValue('');
      } else {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    }
  };

  /**
   * Clear terminal
   */
  const handleClear = () => {
    setLines(['ZPLC Serial Terminal', '']);
  };

  // Subscribe to connection changes
  useEffect(() => {
    const unsubscribe = connectionManager.onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected && isActive) {
        // If we just connected and terminal is active, enable passthrough
        connectionManager.enablePassthrough();
        startReading();
      } else if (!connected) {
        stopReading();
      }
    });
    
    return unsubscribe;
  }, [isActive, startReading, stopReading]);

  // Handle passthrough mode based on tab activation
  useEffect(() => {
    if (isActive && isConnected) {
      // Terminal is active - enable passthrough mode (pauses polling)
      connectionManager.enablePassthrough();
      startReading();
      appendOutput('[Passthrough mode enabled - polling paused]\n');
    } else if (!isActive && isConnected) {
      // Terminal is inactive - disable passthrough (resumes polling)
      stopReading();
      connectionManager.disablePassthrough();
    }
    
    return () => {
      // Cleanup: restore polling when component unmounts
      if (connectionManager.passthroughMode) {
        connectionManager.disablePassthrough();
      }
    };
  }, [isActive, isConnected, startReading, stopReading, appendOutput]);

  // Auto-scroll to bottom when new lines are added
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Focus input when tab becomes active
  useEffect(() => {
    if (isActive && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isActive]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface-900)]">
      {/* Terminal Header */}
      <div className="flex items-center gap-2 px-2 py-1 bg-[var(--color-surface-800)] border-b border-[var(--color-surface-700)]">
        <Terminal size={14} className="text-[var(--color-accent-green)]" />
        <span className="text-xs text-[var(--color-surface-300)]">
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
        {isConnected && connectionManager.passthroughMode && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-accent-purple)]/20 text-[var(--color-accent-purple)]">
            passthrough
          </span>
        )}
        
        <div className="flex-1" />
        
        {/* Connect/Disconnect Button */}
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
            isConnected
              ? 'bg-[var(--color-accent-green)] text-white hover:opacity-90'
              : 'bg-[var(--color-surface-700)] hover:bg-[var(--color-surface-600)] text-[var(--color-surface-200)]'
          } disabled:opacity-50`}
          title={isConnected ? 'Disconnect' : 'Connect to device'}
        >
          {isConnected ? <PlugZap size={12} /> : <Plug size={12} />}
          <span>{isConnecting ? 'Connecting...' : isConnected ? 'Disconnect' : 'Connect'}</span>
        </button>
        
        {/* Clear Button */}
        <button
          onClick={handleClear}
          className="p-1 rounded hover:bg-[var(--color-surface-700)] text-[var(--color-surface-400)] hover:text-[var(--color-surface-200)]"
          title="Clear terminal"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Terminal Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-xs leading-relaxed"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={`whitespace-pre-wrap break-all ${
              line.startsWith('$')
                ? 'text-[var(--color-accent-purple)]'
                : line.startsWith('[ERROR')
                  ? 'text-[var(--color-accent-red)]'
                  : line.startsWith('[')
                    ? 'text-[var(--color-accent-blue)]'
                    : 'text-[var(--color-surface-200)]'
            }`}
          >
            {line || '\u00A0'}
          </div>
        ))}
      </div>

      {/* Input Line */}
      <form onSubmit={handleSubmit} className="flex items-center border-t border-[var(--color-surface-700)]">
        <span className="px-2 text-[var(--color-accent-green)] font-mono text-sm">$</span>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? 'Type a command...' : 'Connect to send commands'}
          disabled={!isConnected}
          className="flex-1 bg-transparent border-none outline-none py-2 pr-2 font-mono text-sm text-[var(--color-surface-100)] placeholder:text-[var(--color-surface-500)] disabled:opacity-50"
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
