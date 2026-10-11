/** MQTT settings of the project's communication (profile, broker, security, last will and cloud services). */

import type {
  CommunicationConfig,
  MQTTCommunicationConfig,
} from '../../types';
import {
  getBoardNetworkType,
} from '../../config/boardProfiles';
import { Checkbox, NumberField, Select, TextField } from '../../ui';

export function MqttSettings({ boardNetworkType, mqtt, updateCommunication }: { boardNetworkType: ReturnType<typeof getBoardNetworkType>; mqtt: MQTTCommunicationConfig; updateCommunication: (updates: Partial<CommunicationConfig>) => void }) {
  return (
        <div>
          <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">MQTT</h3>
          <div className="grid grid-cols-5 gap-3">
            <Checkbox checked={mqtt.enabled} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, enabled: e.target.checked } })} label="Enabled" />
            <Select aria-label="Profile" value={mqtt.profile} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, profile: e.target.value as typeof mqtt.profile } })}>
              <option value="sparkplug-b">Sparkplug B</option>
              <option value="generic-broker">Generic Broker</option>
              <option value="aws-iot-core">AWS IoT Core</option>
              <option value="azure-iot-hub">Azure IoT Hub</option>
              <option value="azure-event-grid-mqtt">Azure Event Grid MQTT</option>
            </Select>
            <Select aria-label="Protocol version" value={mqtt.protocolVersion} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, protocolVersion: e.target.value as typeof mqtt.protocolVersion } })}>
              <option value="3.1.1">MQTT 3.1.1</option>
              <option value="5.0">MQTT 5.0</option>
            </Select>
            <Select aria-label="Transport" value={mqtt.transport} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, transport: e.target.value as typeof mqtt.transport } })}>
              <option value="tcp">TCP</option>
              <option value="tls">TLS</option>
              <option value="ws">WebSocket</option>
              <option value="wss">Secure WebSocket</option>
            </Select>
            <TextField value={mqtt.broker} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, broker: e.target.value } })} placeholder="Broker" className="col-span-2" aria-label="Broker" />
            <NumberField aria-label="Port" min={1} max={65535} value={mqtt.port} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, port: parseInt(e.target.value, 10) || 8883 } })} />
            <NumberField min={1} value={mqtt.publishIntervalMs} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishIntervalMs: parseInt(e.target.value, 10) || 2000 } })} placeholder="Interval ms" aria-label="Interval ms" />
          </div>
          {boardNetworkType === 'none' && mqtt.enabled && (
            <p className="mt-2 text-xs text-[var(--color-accent-yellow)]">
              This board profile does not advertise a network-capable workflow. Keep MQTT disabled or move to a supported network-capable board before treating the configuration as release-ready.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 mt-2">
            <TextField value={mqtt.clientId} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientId: e.target.value } })} placeholder="Client ID" aria-label="Client ID" />
            <TextField value={mqtt.topicNamespace} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, topicNamespace: e.target.value } })} placeholder="Topic namespace" aria-label="Topic namespace" />
            {mqtt.profile === 'sparkplug-b' && (
              <TextField value={mqtt.groupId ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, groupId: e.target.value || undefined } })} placeholder="Sparkplug Group ID" aria-label="Sparkplug Group ID" />
            )}
            {mqtt.profile === 'azure-iot-hub' && (
              <>
                <TextField type="password" value="" disabled placeholder="Azure SharedAccessKey (base64)" className="font-mono" aria-label="Azure SharedAccessKey (base64)" />
                <div className="flex items-center gap-2">
                  <NumberField label="Token expiry (s)" min={300} max={31536000} value={mqtt.azureSasExpirySec ?? 3600} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureSasExpirySec: parseInt(e.target.value, 10) || 3600 } })} className="w-24" />
                </div>
                <Checkbox checked={mqtt.azureTwinEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureTwinEnabled: e.target.checked } })} label="Device Twins" />
                <Checkbox checked={mqtt.azureDirectMethodsEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDirectMethodsEnabled: e.target.checked } })} label="Direct Methods" />
                <Checkbox checked={mqtt.azureC2dEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureC2dEnabled: e.target.checked } })} label="C2D Messaging" />
                <Checkbox checked={mqtt.azureDpsEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEnabled: e.target.checked } })} label="DPS" />
              </>
            )}
            {mqtt.profile === 'azure-iot-hub' && (
              <>
                <TextField value={mqtt.azureDpsIdScope ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsIdScope: e.target.value || undefined } })} placeholder="Azure DPS ID Scope" aria-label="Azure DPS ID Scope" />
                <TextField value={mqtt.azureDpsRegistrationId ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsRegistrationId: e.target.value || undefined } })} placeholder="Azure DPS Registration ID" aria-label="Azure DPS Registration ID" />
                <TextField value={mqtt.azureDpsEndpoint ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEndpoint: e.target.value || undefined } })} placeholder="Azure DPS Endpoint" aria-label="Azure DPS Endpoint" />
              </>
            )}
            {mqtt.profile === 'azure-event-grid-mqtt' && (
              <>
                <TextField value={mqtt.azureEventGridTopic ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridTopic: e.target.value || undefined } })} placeholder="Event Grid topic" aria-label="Event Grid topic" />
                <TextField value={mqtt.azureEventGridSource ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridSource: e.target.value || undefined } })} placeholder="CloudEvent source" aria-label="CloudEvent source" />
                <TextField value={mqtt.azureEventGridEventType ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridEventType: e.target.value || undefined } })} placeholder="CloudEvent type" aria-label="CloudEvent type" />
              </>
            )}
            {mqtt.profile === 'aws-iot-core' && (
              <>
                <Checkbox checked={mqtt.awsShadowEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsShadowEnabled: e.target.checked } })} label="Device Shadows" />
                <Checkbox checked={mqtt.awsJobsEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsJobsEnabled: e.target.checked } })} label="IoT Jobs" />
                <Checkbox checked={mqtt.awsFleetEnabled ?? false} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetEnabled: e.target.checked } })} label="Fleet Provisioning" />
              </>
            )}
            {mqtt.profile === 'aws-iot-core' && (
              <>
                <TextField value={mqtt.awsFleetTemplateName ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetTemplateName: e.target.value || undefined } })} placeholder="Fleet template name" aria-label="Fleet template name" />
                <TextField value={mqtt.awsClaimCertPath ?? ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsClaimCertPath: e.target.value || undefined } })} placeholder="Claim cert path" aria-label="Claim cert path" />
                <TextField value="" disabled placeholder="Claim key path" aria-label="Claim key path" />
              </>
            )}
            <Select aria-label="Security level" value={mqtt.securityLevel} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, securityLevel: e.target.value as typeof mqtt.securityLevel } })}>
              <option value="none">No TLS</option>
              <option value="tls-no-verify">TLS (no verify)</option>
              <option value="tls-server-verify">TLS + server verify</option>
              <option value="tls-mutual">Mutual TLS</option>
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <NumberField min={5} max={3600} value={mqtt.keepAliveSec} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, keepAliveSec: parseInt(e.target.value, 10) || 60 } })} placeholder="KeepAlive s" aria-label="KeepAlive s" />
            <NumberField min={0} value={mqtt.sessionExpirySec} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, sessionExpirySec: parseInt(e.target.value, 10) || 0 } })} placeholder="Session expiry s" aria-label="Session expiry s" />
            <Select aria-label="Publish QoS" value={mqtt.publishQos} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}>
              <option value={0}>Publish QoS 0</option>
              <option value={1}>Publish QoS 1</option>
              <option value={2}>Publish QoS 2</option>
            </Select>
            <Select aria-label="Subscribe QoS" value={mqtt.subscribeQos} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, subscribeQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}>
              <option value={0}>Subscribe QoS 0</option>
              <option value={1}>Subscribe QoS 1</option>
              <option value={2}>Subscribe QoS 2</option>
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <Checkbox checked={mqtt.publishRetain} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishRetain: e.target.checked } })} label="Retain publishes" />
            <Checkbox checked={mqtt.cleanSession} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, cleanSession: e.target.checked } })} label="Clean Session" />
            <TextField value={mqtt.username || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, username: e.target.value || undefined } })} placeholder="Username" aria-label="Username" />
            <TextField type="password" value="" disabled placeholder="Password" aria-label="Password" />
          </div>
          <p className="text-xs text-[var(--color-surface-300)]">Credentials and private-key references are excluded from zplc.json; local secret storage is not available in this build.</p>
          <div className="grid grid-cols-4 gap-3 mt-2">
            <TextField value={mqtt.websocketPath || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, websocketPath: e.target.value || undefined } })} placeholder="WebSocket path" aria-label="WebSocket path" />
            <TextField value={mqtt.alpnProtocols || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, alpnProtocols: e.target.value || undefined } })} placeholder="ALPN protocol" aria-label="ALPN protocol" />
            <TextField value={mqtt.caCertPath || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, caCertPath: e.target.value || undefined } })} placeholder="CA cert path (PEM/DER)" aria-label="CA cert path (PEM/DER)" />
            <TextField value={mqtt.clientCertPath || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientCertPath: e.target.value || undefined } })} placeholder="Client cert path" aria-label="Client cert path" />
            <TextField value="" disabled placeholder="Client key path" aria-label="Client key path" />
          </div>
          <div className="grid grid-cols-5 gap-3 mt-2">
            <Checkbox checked={mqtt.lwtEnabled} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtEnabled: e.target.checked } })} label="Last Will" />
            <TextField value={mqtt.lwtTopic || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtTopic: e.target.value || undefined } })} placeholder="LWT topic" aria-label="LWT topic" />
            <TextField value={mqtt.lwtPayload || ''} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtPayload: e.target.value || undefined } })} placeholder="LWT payload" aria-label="LWT payload" />
            <Select aria-label="LWT QoS" value={mqtt.lwtQos} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtQos: parseInt(e.target.value, 10) as 0 | 1 } })}>
              <option value={0}>LWT QoS 0</option>
              <option value={1}>LWT QoS 1</option>
            </Select>
            <Checkbox checked={mqtt.lwtRetain} onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtRetain: e.target.checked } })} label="Retain LWT" />
          </div>
        </div>
  );
}
