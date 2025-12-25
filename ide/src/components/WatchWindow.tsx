/**
 * @file WatchWindow.tsx
 * @brief Watch Window Component for Variable Inspection
 *
 * Displays a list of watched variables with live values from the
 * debug adapter. Supports adding/removing variables and forcing values.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { IDebugAdapter, WatchVariable, VMInfo, VMState } from '../runtime/debugAdapter';

/**
 * Props for the WatchWindow component
 */
interface WatchWindowProps {
  /** Debug adapter instance */
  adapter: IDebugAdapter | null;
  /** Symbol table from compilation (variable name -> address mapping) */
  symbolTable?: Map<string, { address: number; type: WatchVariable['type'] }>;
  /** Callback when a value is forced */
  onForceValue?: (variable: WatchVariable, newValue: number) => void;
}

/**
 * Format a value for display based on its type
 */
function formatValue(value: number | boolean | undefined, type: WatchVariable['type']): string {
  if (value === undefined) return '---';

  if (type === 'BOOL') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (type === 'REAL') {
    return (value as number).toFixed(3);
  }

  // Integer types - show hex and decimal
  const num = value as number;
  if (type === 'BYTE') {
    return `${num} (0x${num.toString(16).padStart(2, '0').toUpperCase()})`;
  }
  if (type === 'WORD') {
    return `${num} (0x${num.toString(16).padStart(4, '0').toUpperCase()})`;
  }
  if (type === 'DWORD') {
    return `${num} (0x${num.toString(16).padStart(8, '0').toUpperCase()})`;
  }

  return String(num);
}

/**
 * Format address for display
 */
function formatAddress(address: number): string {
  return `0x${address.toString(16).padStart(4, '0').toUpperCase()}`;
}

/**
 * Watch Window Component
 */
export const WatchWindow: React.FC<WatchWindowProps> = ({
  adapter,
  symbolTable,
  onForceValue,
}) => {
  const [watchedVariables, setWatchedVariables] = useState<WatchVariable[]>([]);
  const [vmInfo, setVmInfo] = useState<VMInfo | null>(null);
  const [vmState, setVmState] = useState<VMState>('disconnected');
  const [newVarName, setNewVarName] = useState('');
  const [newVarAddress, setNewVarAddress] = useState('');
  const [newVarType, setNewVarType] = useState<WatchVariable['type']>('BYTE');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingVar, setEditingVar] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Set up event handlers when adapter changes
  useEffect(() => {
    if (!adapter) {
      setVmState('disconnected');
      return;
    }

    adapter.setEventHandlers({
      onStateChange: (state) => {
        setVmState(state);
      },
      onInfoUpdate: (info) => {
        setVmInfo(info);
      },
      onError: (message) => {
        console.error('[WatchWindow] Adapter error:', message);
      },
    });

    // Initial state sync
    setVmState(adapter.state);

    return () => {
      adapter.clearEventHandlers();
    };
  }, [adapter]);

  // Poll variables when adapter is connected and running/paused
  useEffect(() => {
    if (!adapter || !adapter.connected) return;
    if (watchedVariables.length === 0) return;
    if (vmState !== 'running' && vmState !== 'paused') return;

    const pollInterval = setInterval(async () => {
      try {
        const updated = await adapter.readWatchVariables(watchedVariables);
        setWatchedVariables(updated);
      } catch {
        // Ignore polling errors
      }
    }, 250);

    return () => clearInterval(pollInterval);
  }, [adapter, watchedVariables.length, vmState]);

  // Add a new watch variable
  const handleAddVariable = useCallback(() => {
    let address: number;
    let type = newVarType;
    let name = newVarName.trim();

    // Check if name is in symbol table
    if (symbolTable && symbolTable.has(name)) {
      const symbol = symbolTable.get(name)!;
      address = symbol.address;
      type = symbol.type;
    } else if (newVarAddress.trim()) {
      // Parse address from input
      const addrStr = newVarAddress.trim();
      address = addrStr.startsWith('0x')
        ? parseInt(addrStr, 16)
        : parseInt(addrStr, 10);

      if (isNaN(address)) {
        alert('Invalid address');
        return;
      }
    } else {
      alert('Please enter a variable name or address');
      return;
    }

    if (!name) {
      name = formatAddress(address);
    }

    // Check for duplicates
    if (watchedVariables.some((v) => v.address === address)) {
      alert('Variable already being watched');
      return;
    }

    const newVar: WatchVariable = {
      name,
      address,
      type,
      value: undefined,
      forceable: address < 0x1000, // Only IPI region is forceable
    };

    setWatchedVariables((prev) => [...prev, newVar]);
    setNewVarName('');
    setNewVarAddress('');
    setShowAddForm(false);
  }, [newVarName, newVarAddress, newVarType, symbolTable, watchedVariables]);

  // Remove a watch variable
  const handleRemoveVariable = useCallback((address: number) => {
    setWatchedVariables((prev) => prev.filter((v) => v.address !== address));
  }, []);

  // Force a value
  const handleForceValue = useCallback(
    async (variable: WatchVariable) => {
      if (!adapter || !variable.forceable) return;

      const value = parseInt(editValue, 10);
      if (isNaN(value)) {
        alert('Invalid value');
        return;
      }

      try {
        await adapter.poke(variable.address, value);
        onForceValue?.(variable, value);
        setEditingVar(null);
        setEditValue('');
      } catch (e) {
        alert(`Failed to force value: ${e}`);
      }
    },
    [adapter, editValue, onForceValue]
  );

  // Add common OPI/IPI locations as quick-add options
  const quickAddOptions = [
    { name: 'IPI[0]', address: 0x0000, type: 'BYTE' as const },
    { name: 'IPI[1]', address: 0x0001, type: 'BYTE' as const },
    { name: 'IPI[2]', address: 0x0002, type: 'BYTE' as const },
    { name: 'IPI[3]', address: 0x0003, type: 'BYTE' as const },
    { name: 'OPI[0]', address: 0x1000, type: 'BYTE' as const },
    { name: 'OPI[1]', address: 0x1001, type: 'BYTE' as const },
    { name: 'OPI[2]', address: 0x1002, type: 'BYTE' as const },
    { name: 'OPI[3]', address: 0x1003, type: 'BYTE' as const },
  ];

  return (
    <div className="watch-window">
      {/* Header */}
      <div className="watch-header">
        <span className="watch-title">Watch</span>
        <div className="watch-status">
          <span className={`status-indicator status-${vmState}`} />
          <span className="status-text">{vmState}</span>
          {vmInfo && (
            <span className="cycle-count">Cycle: {vmInfo.cycles}</span>
          )}
        </div>
        <button
          className="btn-add"
          onClick={() => setShowAddForm(!showAddForm)}
          title="Add variable"
        >
          +
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className="add-form">
          <div className="add-form-row">
            <input
              type="text"
              placeholder="Variable name"
              value={newVarName}
              onChange={(e) => setNewVarName(e.target.value)}
              className="input-name"
            />
            <input
              type="text"
              placeholder="Address (0x...)"
              value={newVarAddress}
              onChange={(e) => setNewVarAddress(e.target.value)}
              className="input-address"
            />
            <select
              value={newVarType}
              onChange={(e) => setNewVarType(e.target.value as WatchVariable['type'])}
              className="select-type"
            >
              <option value="BOOL">BOOL</option>
              <option value="BYTE">BYTE</option>
              <option value="WORD">WORD</option>
              <option value="DWORD">DWORD</option>
              <option value="INT">INT</option>
              <option value="DINT">DINT</option>
              <option value="REAL">REAL</option>
            </select>
            <button onClick={handleAddVariable} className="btn-confirm">
              Add
            </button>
          </div>
          <div className="quick-add">
            <span className="quick-add-label">Quick add:</span>
            {quickAddOptions.map((opt) => (
              <button
                key={opt.address}
                className="btn-quick-add"
                onClick={() => {
                  if (!watchedVariables.some((v) => v.address === opt.address)) {
                    setWatchedVariables((prev) => [
                      ...prev,
                      { ...opt, value: undefined, forceable: opt.address < 0x1000 },
                    ]);
                  }
                }}
                disabled={watchedVariables.some((v) => v.address === opt.address)}
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Variable List */}
      <div className="watch-list">
        {watchedVariables.length === 0 ? (
          <div className="watch-empty">
            No variables being watched.
            <br />
            Click + to add variables.
          </div>
        ) : (
          <table className="watch-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Type</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {watchedVariables.map((variable) => (
                <tr key={variable.address}>
                  <td className="col-name">{variable.name}</td>
                  <td className="col-address">{formatAddress(variable.address)}</td>
                  <td className="col-type">{variable.type}</td>
                  <td className="col-value">
                    {editingVar === variable.name ? (
                      <div className="edit-value">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleForceValue(variable);
                            if (e.key === 'Escape') setEditingVar(null);
                          }}
                          autoFocus
                          className="input-edit"
                        />
                        <button
                          onClick={() => handleForceValue(variable)}
                          className="btn-set"
                        >
                          Set
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`value ${variable.forceable ? 'forceable' : ''}`}
                        onClick={() => {
                          if (variable.forceable && adapter?.connected) {
                            setEditingVar(variable.name);
                            setEditValue(String(variable.value ?? 0));
                          }
                        }}
                        title={variable.forceable ? 'Click to force value' : ''}
                      >
                        {formatValue(variable.value, variable.type)}
                      </span>
                    )}
                  </td>
                  <td className="col-actions">
                    <button
                      className="btn-remove"
                      onClick={() => handleRemoveVariable(variable.address)}
                      title="Remove"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .watch-window {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-color);
          font-size: 12px;
        }

        .watch-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
        }

        .watch-title {
          font-weight: 600;
          color: var(--text-primary);
        }

        .watch-status {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: auto;
        }

        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #888;
        }

        .status-indicator.status-running { background: #4caf50; }
        .status-indicator.status-paused { background: #ff9800; }
        .status-indicator.status-idle { background: #2196f3; }
        .status-indicator.status-error { background: #f44336; }
        .status-indicator.status-disconnected { background: #888; }

        .status-text {
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .cycle-count {
          color: var(--text-tertiary);
          margin-left: 8px;
        }

        .btn-add {
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 4px;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 16px;
          line-height: 1;
        }

        .btn-add:hover {
          filter: brightness(1.1);
        }

        .add-form {
          padding: 8px;
          background: var(--bg-tertiary);
          border-bottom: 1px solid var(--border-color);
        }

        .add-form-row {
          display: flex;
          gap: 4px;
        }

        .input-name,
        .input-address {
          flex: 1;
          padding: 4px 8px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 12px;
        }

        .select-type {
          width: 80px;
          padding: 4px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-size: 12px;
        }

        .btn-confirm {
          padding: 4px 12px;
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .quick-add {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 8px;
          align-items: center;
        }

        .quick-add-label {
          color: var(--text-secondary);
          font-size: 11px;
        }

        .btn-quick-add {
          padding: 2px 8px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 11px;
        }

        .btn-quick-add:hover:not(:disabled) {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .btn-quick-add:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .watch-list {
          flex: 1;
          overflow-y: auto;
        }

        .watch-empty {
          padding: 16px;
          text-align: center;
          color: var(--text-tertiary);
        }

        .watch-table {
          width: 100%;
          border-collapse: collapse;
        }

        .watch-table th {
          text-align: left;
          padding: 4px 8px;
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          font-weight: 500;
          border-bottom: 1px solid var(--border-color);
          position: sticky;
          top: 0;
        }

        .watch-table td {
          padding: 4px 8px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-primary);
        }

        .col-name { font-family: monospace; }
        .col-address { font-family: monospace; color: var(--text-secondary); }
        .col-type { color: var(--text-tertiary); }
        .col-value { font-family: monospace; }
        .col-actions { width: 24px; }

        .value.forceable {
          cursor: pointer;
          text-decoration: underline dotted;
        }

        .value.forceable:hover {
          color: var(--accent-color);
        }

        .edit-value {
          display: flex;
          gap: 4px;
        }

        .input-edit {
          width: 60px;
          padding: 2px 4px;
          border: 1px solid var(--accent-color);
          border-radius: 2px;
          background: var(--bg-primary);
          color: var(--text-primary);
          font-family: monospace;
          font-size: 12px;
        }

        .btn-set {
          padding: 2px 6px;
          background: var(--accent-color);
          color: white;
          border: none;
          border-radius: 2px;
          cursor: pointer;
          font-size: 10px;
        }

        .btn-remove {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 14px;
          padding: 0 4px;
        }

        .btn-remove:hover {
          color: #f44336;
        }
      `}</style>
    </div>
  );
};

export default WatchWindow;
