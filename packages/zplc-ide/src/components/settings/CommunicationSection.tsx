/** Communication of the project: MQTT, Modbus and the tags that cross them. */

import type {
  CommunicationConfig,
  MQTTCommunicationConfig,
  ModbusClientConfig,
  CommunicationTagConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import type { SectionProps } from './settingsSectionProps';
import { MqttSettings } from './MqttSettings';
import { ModbusSettings } from './ModbusSettings';
import { CommunicationTags } from './CommunicationTags';

export function CommunicationSection({ config, updateConfig }: SectionProps) {
  const boardNetworkType = getBoardNetworkType(config.target?.board);
  const defaultMqtt: MQTTCommunicationConfig = {
    enabled: false,
    profile: 'sparkplug-b',
    protocolVersion: '5.0',
    transport: 'tcp',
    broker: 'test.mosquitto.org',
    port: 1883,
    clientId: 'zplc-device',
    keepAliveSec: 60,
    cleanSession: true,
    sessionExpirySec: 0,
    topicNamespace: 'spBv1.0/ZPLC',
    publishIntervalMs: 2000,
    publishQos: 0,
    subscribeQos: 0,
    publishRetain: false,
    securityLevel: 'none',
    websocketPath: '/mqtt',
    lwtEnabled: false,
    lwtPayload: 'offline',
    lwtQos: 0,
    lwtRetain: false,
    azureTwinEnabled: false,
    azureDirectMethodsEnabled: false,
    azureC2dEnabled: false,
    azureDpsEnabled: false,
    azureDpsEndpoint: 'global.azure-devices-provisioning.net',
    awsShadowEnabled: false,
    awsJobsEnabled: false,
    awsFleetEnabled: false,
  };

  const defaultModbusClient: ModbusClientConfig = {
    rtuClientEnabled: false,
    rtuClientSlaveId: 1,
    rtuClientPollMs: 100,
    tcpClientEnabled: false,
    tcpClientHost: '192.168.1.100',
    tcpClientPort: 502,
    tcpClientUnitId: 1,
    tcpClientPollMs: 100,
    tcpClientTimeoutMs: 500,
  };

  const communication: CommunicationConfig = config.communication || {
    mqtt: defaultMqtt,
    modbus: {
      enabled: false,
      unitId: 1,
      tcpEnabled: true,
      tcpPort: 502,
      rtuEnabled: false,
      rtuBaud: 19200,
      rtuParity: 'none',
      pollIntervalMs: 100,
      client: defaultModbusClient,
    },
    tags: [],
  };

  const mqtt: MQTTCommunicationConfig = communication.mqtt || defaultMqtt;

  const modbus = communication.modbus || {
    enabled: false,
    unitId: 1,
    tcpEnabled: true,
    tcpPort: 502,
    rtuEnabled: false,
    rtuBaud: 19200,
    rtuParity: 'none' as const,
    pollIntervalMs: 100,
    client: defaultModbusClient,
  };
  const modbusClient = modbus.client || defaultModbusClient;

  const tags = communication.bindings || communication.tags || [];

  const updateCommunication = (updates: Partial<CommunicationConfig>) => {
    const nextBindings = updates.bindings ?? updates.tags;
    updateConfig({
      communication: {
        ...communication,
        ...updates,
        ...(nextBindings ? { bindings: nextBindings, tags: nextBindings } : {}),
      },
    });
  };

  const addTag = () => {
    const index = tags.length;
    const next: CommunicationTagConfig = {
      name: `Tag${index + 1}`,
      symbol: `CommTag${index + 1}`,
      type: 'REAL',
      publish: true,
    };
    updateCommunication({ tags: [...tags, next] });
  };

  const updateTag = (index: number, updates: Partial<CommunicationTagConfig>) => {
    const next = [...tags];
    next[index] = { ...next[index], ...updates };
    updateCommunication({ tags: next });
  };

  const removeTag = (index: number) => {
    updateCommunication({ tags: tags.filter((_, i) => i !== index) });
  };

  return (
    <div className="pt-4 space-y-6">
      <div className="rounded-lg border border-[var(--color-surface-600)] bg-[var(--color-surface-800)]/70 p-3 text-xs text-[var(--color-surface-300)]">
        <p className="font-medium text-[var(--color-surface-100)]">v1.5 communication scope</p>
        <p className="mt-1">
          MQTT, Modbus RTU, and Modbus TCP are only release-ready when the selected board,
          runtime support, and release evidence all agree.
        </p>
        <p className="mt-1 text-[var(--color-surface-400)]">
          Current board network profile: <strong className="text-[var(--color-accent-blue)]">{boardNetworkType}</strong>
        </p>
      </div>
      <MqttSettings boardNetworkType={boardNetworkType} mqtt={mqtt} updateCommunication={updateCommunication} />

      <ModbusSettings boardNetworkType={boardNetworkType} modbus={modbus} modbusClient={modbusClient} updateCommunication={updateCommunication} />

      <CommunicationTags tags={tags} addTag={addTag} updateTag={updateTag} removeTag={removeTag} />
    </div>
  );
}
