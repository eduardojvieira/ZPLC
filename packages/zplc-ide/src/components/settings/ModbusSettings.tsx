/** Modbus server and client settings of the project's communication. */

import type {
  CommunicationConfig,
  ModbusClientConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';

export function ModbusSettings({ boardNetworkType, modbus, modbusClient, updateCommunication }: { boardNetworkType: ReturnType<typeof getBoardNetworkType>; modbus: NonNullable<CommunicationConfig['modbus']>; modbusClient: ModbusClientConfig; updateCommunication: (updates: Partial<CommunicationConfig>) => void }) {
  return (
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-2">Modbus</label>
          <p className="text-xs text-[var(--color-surface-400)] mb-2">
            Configure the onboard Modbus TCP/RTU servers first, then optional client polling.
          </p>
          <div className="grid grid-cols-6 gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={modbus.enabled}
                onChange={(e) => updateCommunication({ modbus: { ...modbus, enabled: e.target.checked } })}
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={modbus.tcpEnabled}
                onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpEnabled: e.target.checked } })}
                disabled={!modbus.enabled}
              />
              TCP
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={modbus.rtuEnabled}
                onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuEnabled: e.target.checked } })}
                disabled={!modbus.enabled}
              />
              RTU
            </label>
            <input
              type="number"
              min={1}
              max={247}
              value={modbus.unitId}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, unitId: parseInt(e.target.value, 10) || 1 } })}
              placeholder="Unit ID"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              max={65535}
              value={modbus.tcpPort}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpPort: parseInt(e.target.value, 10) || 502 } })}
              placeholder="Port"
              disabled={!modbus.enabled || !modbus.tcpEnabled}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              value={modbus.pollIntervalMs}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, pollIntervalMs: parseInt(e.target.value, 10) || 100 } })}
              placeholder="Poll ms"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <input
              type="number"
              min={1200}
              max={1000000}
              value={modbus.rtuBaud}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuBaud: parseInt(e.target.value, 10) || 19200 } })}
              placeholder="RTU baud"
              disabled={!modbus.enabled || !modbus.rtuEnabled}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <select
              value={modbus.rtuParity}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuParity: e.target.value as typeof modbus.rtuParity } })}
              disabled={!modbus.enabled || !modbus.rtuEnabled}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value="none">RTU parity: none</option>
              <option value="even">RTU parity: even</option>
              <option value="odd">RTU parity: odd</option>
            </select>
            <div className="px-3 py-2 text-xs rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] text-[var(--color-surface-400)]">
              RTU uses the board's configured `zephyr,modbus-serial` UART.
            </div>
          </div>
          {boardNetworkType === 'none' && modbus.tcpEnabled && (
            <p className="mt-2 text-xs text-[var(--color-accent-yellow)]">
              Modbus TCP requires a network-capable board profile in the supported-board list.
            </p>
          )}
          <div className="grid grid-cols-5 gap-3 mt-3">
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={modbusClient.rtuClientEnabled}
                onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientEnabled: e.target.checked } } })}
              />
              RTU Client
            </label>
            <input
              type="number"
              min={1}
              max={247}
              value={modbusClient.rtuClientSlaveId}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientSlaveId: parseInt(e.target.value, 10) || 1 } } })}
              placeholder="RTU slave ID"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              value={modbusClient.rtuClientPollMs}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientPollMs: parseInt(e.target.value, 10) || 100 } } })}
              placeholder="RTU poll ms"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={modbusClient.tcpClientEnabled}
                onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientEnabled: e.target.checked } } })}
              />
              TCP Client
            </label>
            <input
              type="text"
              value={modbusClient.tcpClientHost}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientHost: e.target.value } } })}
              placeholder="TCP host"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <input
              type="number"
              min={1}
              max={65535}
              value={modbusClient.tcpClientPort}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientPort: parseInt(e.target.value, 10) || 502 } } })}
              placeholder="TCP client port"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              max={247}
              value={modbusClient.tcpClientUnitId}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientUnitId: parseInt(e.target.value, 10) || 1 } } })}
              placeholder="TCP unit ID"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              value={modbusClient.tcpClientPollMs}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientPollMs: parseInt(e.target.value, 10) || 100 } } })}
              placeholder="TCP poll ms"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              value={modbusClient.tcpClientTimeoutMs}
              onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientTimeoutMs: parseInt(e.target.value, 10) || 500 } } })}
              placeholder="TCP timeout ms"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
        </div>
  );
}
