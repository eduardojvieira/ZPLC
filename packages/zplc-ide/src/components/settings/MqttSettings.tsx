/** MQTT settings of the project's communication (profile, broker, security, last will and cloud services). */

import type {
  CommunicationConfig,
  MQTTCommunicationConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';

export function MqttSettings({ boardNetworkType, mqtt, updateCommunication }: { boardNetworkType: ReturnType<typeof getBoardNetworkType>; mqtt: MQTTCommunicationConfig; updateCommunication: (updates: Partial<CommunicationConfig>) => void }) {
  return (
        <div>
          <label className="block text-xs text-[var(--color-surface-400)] mb-2">MQTT</label>
          <div className="grid grid-cols-5 gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={mqtt.enabled}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, enabled: e.target.checked } })}
              />
              Enabled
            </label>
            <select
              value={mqtt.profile}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, profile: e.target.value as typeof mqtt.profile } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value="sparkplug-b">Sparkplug B</option>
              <option value="generic-broker">Generic Broker</option>
              <option value="aws-iot-core">AWS IoT Core</option>
              <option value="azure-iot-hub">Azure IoT Hub</option>
              <option value="azure-event-grid-mqtt">Azure Event Grid MQTT</option>
            </select>
            <select
              value={mqtt.protocolVersion}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, protocolVersion: e.target.value as typeof mqtt.protocolVersion } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value="3.1.1">MQTT 3.1.1</option>
              <option value="5.0">MQTT 5.0</option>
            </select>
            <select
              value={mqtt.transport}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, transport: e.target.value as typeof mqtt.transport } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value="tcp">TCP</option>
              <option value="tls">TLS</option>
              <option value="ws">WebSocket</option>
              <option value="wss">Secure WebSocket</option>
            </select>
            <input
              type="text"
              value={mqtt.broker}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, broker: e.target.value } })}
              placeholder="Broker"
              className="col-span-2 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              max={65535}
              value={mqtt.port}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, port: parseInt(e.target.value, 10) || 8883 } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={1}
              value={mqtt.publishIntervalMs}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishIntervalMs: parseInt(e.target.value, 10) || 2000 } })}
              placeholder="Interval ms"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
          </div>
          {boardNetworkType === 'none' && mqtt.enabled && (
            <p className="mt-2 text-xs text-[var(--color-accent-yellow)]">
              This board profile does not advertise a network-capable workflow. Keep MQTT disabled or move to a supported network-capable board before treating the configuration as release-ready.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 mt-2">
            <input
              type="text"
              value={mqtt.clientId}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientId: e.target.value } })}
              placeholder="Client ID"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={mqtt.topicNamespace}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, topicNamespace: e.target.value } })}
              placeholder="Topic namespace"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            {mqtt.profile === 'sparkplug-b' && (
              <input
                type="text"
                value={mqtt.groupId ?? ''}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, groupId: e.target.value || undefined } })}
                placeholder="Sparkplug Group ID"
                className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
              />
            )}
            {mqtt.profile === 'azure-iot-hub' && (
              <>
                <input
                  type="password"
                  value=""
                  disabled
                  placeholder="Azure SharedAccessKey (base64)"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded font-mono disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--color-text-muted)] whitespace-nowrap">Token expiry (s)</label>
                  <input
                    type="number"
                    min={300}
                    max={31536000}
                    value={mqtt.azureSasExpirySec ?? 3600}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureSasExpirySec: parseInt(e.target.value, 10) || 3600 } })}
                    className="w-24 px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.azureTwinEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureTwinEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  Device Twins
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.azureDirectMethodsEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDirectMethodsEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  Direct Methods
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.azureC2dEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureC2dEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  C2D Messaging
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.azureDpsEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  DPS
                </label>
              </>
            )}
            {mqtt.profile === 'azure-iot-hub' && (
              <>
                <input
                  type="text"
                  value={mqtt.azureDpsIdScope ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsIdScope: e.target.value || undefined } })}
                  placeholder="Azure DPS ID Scope"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value={mqtt.azureDpsRegistrationId ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsRegistrationId: e.target.value || undefined } })}
                  placeholder="Azure DPS Registration ID"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value={mqtt.azureDpsEndpoint ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEndpoint: e.target.value || undefined } })}
                  placeholder="Azure DPS Endpoint"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
              </>
            )}
            {mqtt.profile === 'azure-event-grid-mqtt' && (
              <>
                <input
                  type="text"
                  value={mqtt.azureEventGridTopic ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridTopic: e.target.value || undefined } })}
                  placeholder="Event Grid topic"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value={mqtt.azureEventGridSource ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridSource: e.target.value || undefined } })}
                  placeholder="CloudEvent source"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value={mqtt.azureEventGridEventType ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridEventType: e.target.value || undefined } })}
                  placeholder="CloudEvent type"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
              </>
            )}
            {mqtt.profile === 'aws-iot-core' && (
              <>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.awsShadowEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsShadowEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  Device Shadows
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.awsJobsEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsJobsEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  IoT Jobs
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mqtt.awsFleetEnabled ?? false}
                    onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetEnabled: e.target.checked } })}
                    className="accent-[var(--color-primary)]"
                  />
                  Fleet Provisioning
                </label>
              </>
            )}
            {mqtt.profile === 'aws-iot-core' && (
              <>
                <input
                  type="text"
                  value={mqtt.awsFleetTemplateName ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetTemplateName: e.target.value || undefined } })}
                  placeholder="Fleet template name"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value={mqtt.awsClaimCertPath ?? ''}
                  onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsClaimCertPath: e.target.value || undefined } })}
                  placeholder="Claim cert path"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
                />
                <input
                  type="text"
                  value=""
                  disabled
                  placeholder="Claim key path"
                  className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded disabled:cursor-not-allowed disabled:opacity-60"
                />
              </>
            )}
            <select
              value={mqtt.securityLevel}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, securityLevel: e.target.value as typeof mqtt.securityLevel } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value="none">No TLS</option>
              <option value="tls-no-verify">TLS (no verify)</option>
              <option value="tls-server-verify">TLS + server verify</option>
              <option value="tls-mutual">Mutual TLS</option>
            </select>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <input
              type="number"
              min={5}
              max={3600}
              value={mqtt.keepAliveSec}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, keepAliveSec: parseInt(e.target.value, 10) || 60 } })}
              placeholder="KeepAlive s"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="number"
              min={0}
              value={mqtt.sessionExpirySec}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, sessionExpirySec: parseInt(e.target.value, 10) || 0 } })}
              placeholder="Session expiry s"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <select
              value={mqtt.publishQos}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value={0}>Publish QoS 0</option>
              <option value={1}>Publish QoS 1</option>
              <option value={2}>Publish QoS 2</option>
            </select>
            <select
              value={mqtt.subscribeQos}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, subscribeQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value={0}>Subscribe QoS 0</option>
              <option value={1}>Subscribe QoS 1</option>
              <option value={2}>Subscribe QoS 2</option>
            </select>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={mqtt.publishRetain}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishRetain: e.target.checked } })}
              />
              Retain publishes
            </label>
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={mqtt.cleanSession}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, cleanSession: e.target.checked } })}
              />
              Clean Session
            </label>
            <input
              type="text"
              value={mqtt.username || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, username: e.target.value || undefined } })}
              placeholder="Username"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="password"
              value=""
              disabled
              placeholder="Password"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <p className="text-xs text-[var(--color-surface-300)]">Credentials and private-key references are excluded from zplc.json; local secret storage is not available in this build.</p>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <input
              type="text"
              value={mqtt.websocketPath || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, websocketPath: e.target.value || undefined } })}
              placeholder="WebSocket path"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={mqtt.alpnProtocols || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, alpnProtocols: e.target.value || undefined } })}
              placeholder="ALPN protocol"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={mqtt.caCertPath || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, caCertPath: e.target.value || undefined } })}
              placeholder="CA cert path (PEM/DER)"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={mqtt.clientCertPath || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientCertPath: e.target.value || undefined } })}
              placeholder="Client cert path"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value=""
              disabled
              placeholder="Client key path"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>
          <div className="grid grid-cols-5 gap-3 mt-2">
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={mqtt.lwtEnabled}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtEnabled: e.target.checked } })}
              />
              Last Will
            </label>
            <input
              type="text"
              value={mqtt.lwtTopic || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtTopic: e.target.value || undefined } })}
              placeholder="LWT topic"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <input
              type="text"
              value={mqtt.lwtPayload || ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtPayload: e.target.value || undefined } })}
              placeholder="LWT payload"
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            />
            <select
              value={mqtt.lwtQos}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtQos: parseInt(e.target.value, 10) as 0 | 1 } })}
              className="px-2 py-1 text-sm bg-[var(--color-surface-700)] border border-[var(--color-surface-500)] rounded"
            >
              <option value={0}>LWT QoS 0</option>
              <option value={1}>LWT QoS 1</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-[var(--color-surface-200)]">
              <input
                type="checkbox"
                checked={mqtt.lwtRetain}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtRetain: e.target.checked } })}
              />
              Retain LWT
            </label>
          </div>
        </div>
  );
}
