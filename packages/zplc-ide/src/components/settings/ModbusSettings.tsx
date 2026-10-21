/** Modbus server and client settings of the project's communication. */

import type { CommunicationConfig, ModbusClientConfig } from '../../types';
import { getBoardNetworkType } from '../../config/boardProfiles';
import { Checkbox, NumberField, Select, TextField } from '../../ui';
import { useT } from '../../i18n';

export function ModbusSettings({
  boardNetworkType,
  modbus,
  modbusClient,
  updateCommunication,
}: {
  boardNetworkType: ReturnType<typeof getBoardNetworkType>;
  modbus: NonNullable<CommunicationConfig['modbus']>;
  modbusClient: ModbusClientConfig;
  updateCommunication: (updates: Partial<CommunicationConfig>) => void;
}) {
  const { t } = useT();
  return (
    <div>
      <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">{t('modbus.modbus')}</h3>
      <p className="text-xs text-[var(--color-surface-400)] mb-2">{t('modbus.configureTheOnboardModbus')}</p>
      <div className="grid grid-cols-6 gap-3">
        <Checkbox
          checked={modbus.enabled}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, enabled: e.target.checked } })}
          label={t('console.enabled2')}
        />
        <Checkbox
          checked={modbus.tcpEnabled}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpEnabled: e.target.checked } })}
          disabled={!modbus.enabled}
          label={t('mqtt.tcp')}
        />
        <Checkbox
          checked={modbus.rtuEnabled}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuEnabled: e.target.checked } })}
          disabled={!modbus.enabled}
          label={t('modbus.rtu')}
        />
        <NumberField
          min={1}
          max={247}
          value={modbus.unitId}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, unitId: parseInt(e.target.value, 10) || 1 } })}
          placeholder={t('modbus.unitId')}
          aria-label={t('modbus.unitId')}
        />
        <NumberField
          min={1}
          max={65535}
          value={modbus.tcpPort}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, tcpPort: parseInt(e.target.value, 10) || 502 } })}
          placeholder={t('mqtt.port')}
          disabled={!modbus.enabled || !modbus.tcpEnabled}
          aria-label={t('mqtt.port')}
        />
        <NumberField
          min={1}
          value={modbus.pollIntervalMs}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, pollIntervalMs: parseInt(e.target.value, 10) || 100 } })}
          placeholder={t('modbus.pollMs')}
          aria-label={t('modbus.pollMs')}
        />
      </div>
      <div className="grid grid-cols-3 gap-3 mt-2">
        <NumberField
          min={1200}
          max={1000000}
          value={modbus.rtuBaud}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuBaud: parseInt(e.target.value, 10) || 19200 } })}
          placeholder={t('modbus.rtuBaud')}
          disabled={!modbus.enabled || !modbus.rtuEnabled}
          aria-label={t('modbus.rtuBaud')}
        />
        <Select
          aria-label={t('modbus.rtuParity')}
          value={modbus.rtuParity}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, rtuParity: e.target.value as typeof modbus.rtuParity } })}
          disabled={!modbus.enabled || !modbus.rtuEnabled}
        >
          <option value="none">{t('modbus.rtuParityNone')}</option>
          <option value="even">{t('modbus.rtuParityEven')}</option>
          <option value="odd">{t('modbus.rtuParityOdd')}</option>
        </Select>
        <div
          className={
            'px-3 py-2 text-xs rounded border border-[var(--color-surface-600)] bg-[var(--color-surface-800)] ' +
            'text-[var(--color-surface-400)]'
          }
        >
          {t('modbus.rtuUsesTheBoard')}
        </div>
      </div>
      {boardNetworkType === 'none' && modbus.tcpEnabled && (
        <p className="mt-2 text-xs text-[var(--color-accent-yellow)]">{t('modbus.modbusTcpRequiresA')}</p>
      )}
      <div className="grid grid-cols-5 gap-3 mt-3">
        <Checkbox
          checked={modbusClient.rtuClientEnabled}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientEnabled: e.target.checked } } })}
          label={t('modbus.rtuClient')}
        />
        <NumberField
          min={1}
          max={247}
          value={modbusClient.rtuClientSlaveId}
          onChange={(e) =>
            updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, rtuClientSlaveId: parseInt(e.target.value, 10) || 1 } } })
          }
          placeholder={t('modbus.rtuSlaveId')}
          aria-label={t('modbus.rtuSlaveId')}
        />
        <NumberField
          min={1}
          value={modbusClient.rtuClientPollMs}
          onChange={(e) =>
            updateCommunication({
              modbus: { ...modbus, client: { ...modbusClient, rtuClientPollMs: parseInt(e.target.value, 10) || 100 } },
            })
          }
          placeholder={t('modbus.rtuPollMs')}
          aria-label={t('modbus.rtuPollMs')}
        />
        <Checkbox
          checked={modbusClient.tcpClientEnabled}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientEnabled: e.target.checked } } })}
          label={t('modbus.tcpClient')}
        />
        <TextField
          value={modbusClient.tcpClientHost}
          onChange={(e) => updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientHost: e.target.value } } })}
          placeholder={t('modbus.tcpHost')}
          aria-label={t('modbus.tcpHost')}
        />
      </div>
      <div className="grid grid-cols-4 gap-3 mt-2">
        <NumberField
          min={1}
          max={65535}
          value={modbusClient.tcpClientPort}
          onChange={(e) =>
            updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientPort: parseInt(e.target.value, 10) || 502 } } })
          }
          placeholder={t('modbus.tcpClientPort')}
          aria-label={t('modbus.tcpClientPort')}
        />
        <NumberField
          min={1}
          max={247}
          value={modbusClient.tcpClientUnitId}
          onChange={(e) =>
            updateCommunication({ modbus: { ...modbus, client: { ...modbusClient, tcpClientUnitId: parseInt(e.target.value, 10) || 1 } } })
          }
          placeholder={t('modbus.tcpUnitId')}
          aria-label={t('modbus.tcpUnitId')}
        />
        <NumberField
          min={1}
          value={modbusClient.tcpClientPollMs}
          onChange={(e) =>
            updateCommunication({
              modbus: { ...modbus, client: { ...modbusClient, tcpClientPollMs: parseInt(e.target.value, 10) || 100 } },
            })
          }
          placeholder={t('modbus.tcpPollMs')}
          aria-label={t('modbus.tcpPollMs')}
        />
        <NumberField
          min={1}
          value={modbusClient.tcpClientTimeoutMs}
          onChange={(e) =>
            updateCommunication({
              modbus: { ...modbus, client: { ...modbusClient, tcpClientTimeoutMs: parseInt(e.target.value, 10) || 500 } },
            })
          }
          placeholder={t('modbus.tcpTimeoutMs')}
          aria-label={t('modbus.tcpTimeoutMs')}
        />
      </div>
    </div>
  );
}
