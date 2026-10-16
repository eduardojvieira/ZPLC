/** Modbus server and client settings of the project's communication. */

import type {
  CommunicationConfig,
  ModbusClientConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import { Checkbox, NumberField, Select, TextField } from '../../ui';

export function ModbusSettings({ boardNetworkType, modbus, modbusClient, updateCommunication }: { boardNetworkType: ReturnType<typeof getBoardNetworkType>; modbus: NonNullable<CommunicationConfig['modbus']>; modbusClient: ModbusClientConfig; updateCommunication: (updates: Partial<CommunicationConfig>) => void }) {
  return (
        <div>
          <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">Modbus</h3>
          <p className="text-xs text-[var(--color-surface-400)] mb-2">
            Configure the onboard Modbus TCP/RTU servers first, then optional client polling.
          </p>
          <div className="grid grid-cols-6 gap-3">
            <Checkbox checked={modbus.enabled} onChange={(e) => updateCommunication({ modbus: { ...modbus, enabled: e.target.checked } })} label="Enabled" />
            <Checkbox checked={modbus.tcpEnabled} onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpEnabled: e.target.checked } })} disabled={!modbus.enabled} label="TCP" />
            <Checkbox checked={modbus.rtuEnabled} onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuEnabled: e.target.checked } })} disabled={!modbus.enabled} label="RTU" />
            <NumberField min={1} max={247} value={modbus.unitId} onChange={(e) => updateCommunication({ modbus: { ...modbus, unitId: parseInt(e.target.value, 10) || 1 } })} placeholder="Unit ID" aria-label="Unit ID" />
            <NumberField min={1} max={65535} value={modbus.tcpPort} onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpPort: parseInt(e.target.value, 10) || 502 } })} placeholder="Port" disabled={!modbus.enabled || !modbus.tcpEnabled} aria-label="Port" />
            <NumberField min={1} value={modbus.pollIntervalMs} onChange={(e) => updateCommunication({ modbus: { ...modbus, pollIntervalMs: parseInt(e.target.value, 10) || 100 } })} placeholder="Poll ms" aria-label="Poll ms" />
          </div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            <NumberField min={1200} max={1000000} value={modbus.rtuBaud} onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuBaud: parseInt(e.target.value, 10) || 19200 } })} placeholder="RTU baud" disabled={!modbus.enabled || !modbus.rtuEnabled} aria-label="RTU baud" />
            <Select aria-label="RTU parity" value={modbus.rtuParity} onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuParity: e.target.value as typeof modbus.rtuParity } })} disabled={!modbus.enabled || !modbus.rtuEnabled}>
              <option value="none">RTU parity: none</option>
              <option value="even">RTU parity: even</option>
              <option value="odd">RTU parity: odd</option>
            </Select>
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
            <Checkbox checked={modbusClient.rtuClientEnabled} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientEnabled: e.target.checked } } })} label="RTU Client" />
            <NumberField min={1} max={247} value={modbusClient.rtuClientSlaveId} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientSlaveId: parseInt(e.target.value, 10) || 1 } } })} placeholder="RTU slave ID" aria-label="RTU slave ID" />
            <NumberField min={1} value={modbusClient.rtuClientPollMs} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientPollMs: parseInt(e.target.value, 10) || 100 } } })} placeholder="RTU poll ms" aria-label="RTU poll ms" />
            <Checkbox checked={modbusClient.tcpClientEnabled} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientEnabled: e.target.checked } } })} label="TCP Client" />
            <TextField value={modbusClient.tcpClientHost} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientHost: e.target.value } } })} placeholder="TCP host" aria-label="TCP host" />
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <NumberField min={1} max={65535} value={modbusClient.tcpClientPort} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientPort: parseInt(e.target.value, 10) || 502 } } })} placeholder="TCP client port" aria-label="TCP client port" />
            <NumberField min={1} max={247} value={modbusClient.tcpClientUnitId} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientUnitId: parseInt(e.target.value, 10) || 1 } } })} placeholder="TCP unit ID" aria-label="TCP unit ID" />
            <NumberField min={1} value={modbusClient.tcpClientPollMs} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientPollMs: parseInt(e.target.value, 10) || 100 } } })} placeholder="TCP poll ms" aria-label="TCP poll ms" />
            <NumberField min={1} value={modbusClient.tcpClientTimeoutMs} onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientTimeoutMs: parseInt(e.target.value, 10) || 500 } } })} placeholder="TCP timeout ms" aria-label="TCP timeout ms" />
          </div>
        </div>
  );
}
