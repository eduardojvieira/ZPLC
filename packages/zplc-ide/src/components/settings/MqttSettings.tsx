/** MQTT settings of the project's communication (profile, broker, security, last will and cloud services). */

import type { CommunicationConfig, MQTTCommunicationConfig } from '../../types';
import { getBoardNetworkType } from '../../config/boardProfiles';
import { Checkbox, NumberField, Select, TextField } from '../../ui';
import { useT } from '../../i18n';

export function MqttSettings({
  boardNetworkType,
  mqtt,
  updateCommunication,
}: {
  boardNetworkType: ReturnType<typeof getBoardNetworkType>;
  mqtt: MQTTCommunicationConfig;
  updateCommunication: (updates: Partial<CommunicationConfig>) => void;
}) {
  const { t } = useT();
  return (
    <div>
      <h3 className="block text-xs text-[var(--color-surface-400)] mb-2">{t('mqtt.mqtt')}</h3>
      <div className="grid grid-cols-5 gap-3">
        <Checkbox
          checked={mqtt.enabled}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, enabled: e.target.checked } })}
          label={t('console.enabled2')}
        />
        <Select
          aria-label={t('mqtt.profile')}
          value={mqtt.profile}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, profile: e.target.value as typeof mqtt.profile } })}
        >
          <option value="sparkplug-b">{t('mqtt.sparkplugB')}</option>
          <option value="generic-broker">{t('mqtt.genericBroker')}</option>
          <option value="aws-iot-core">{t('mqtt.awsIotCore')}</option>
          <option value="azure-iot-hub">{t('mqtt.azureIotHub')}</option>
          <option value="azure-event-grid-mqtt">{t('mqtt.azureEventGridMqtt')}</option>
        </Select>
        <Select
          aria-label={t('mqtt.protocolVersion')}
          value={mqtt.protocolVersion}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, protocolVersion: e.target.value as typeof mqtt.protocolVersion } })}
        >
          <option value="3.1.1">{t('mqtt.mqtt311')}</option>
          <option value="5.0">{t('mqtt.mqtt50')}</option>
        </Select>
        <Select
          aria-label={t('mqtt.transport')}
          value={mqtt.transport}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, transport: e.target.value as typeof mqtt.transport } })}
        >
          <option value="tcp">{t('mqtt.tcp')}</option>
          <option value="tls">{t('mqtt.tls')}</option>
          <option value="ws">{t('mqtt.websocket')}</option>
          <option value="wss">{t('mqtt.secureWebsocket')}</option>
        </Select>
        <TextField
          value={mqtt.broker}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, broker: e.target.value } })}
          placeholder={t('mqtt.broker')}
          className="col-span-2"
          aria-label={t('mqtt.broker')}
        />
        <NumberField
          aria-label={t('mqtt.port')}
          min={1}
          max={65535}
          value={mqtt.port}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, port: parseInt(e.target.value, 10) || 8883 } })}
        />
        <NumberField
          min={1}
          value={mqtt.publishIntervalMs}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishIntervalMs: parseInt(e.target.value, 10) || 2000 } })}
          placeholder={t('mqtt.intervalMs')}
          aria-label={t('mqtt.intervalMs')}
        />
      </div>
      {boardNetworkType === 'none' && mqtt.enabled && (
        <p className="mt-2 text-xs text-[var(--color-accent-yellow)]">{t('mqtt.thisBoardProfileDoes')}</p>
      )}
      <div className="grid grid-cols-3 gap-3 mt-2">
        <TextField
          value={mqtt.clientId}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientId: e.target.value } })}
          placeholder={t('mqtt.clientId')}
          aria-label={t('mqtt.clientId')}
        />
        <TextField
          value={mqtt.topicNamespace}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, topicNamespace: e.target.value } })}
          placeholder={t('mqtt.topicNamespace')}
          aria-label={t('mqtt.topicNamespace')}
        />
        {mqtt.profile === 'sparkplug-b' && (
          <TextField
            value={mqtt.groupId ?? ''}
            onChange={(e) => updateCommunication({ mqtt: { ...mqtt, groupId: e.target.value || undefined } })}
            placeholder={t('mqtt.sparkplugGroupId')}
            aria-label={t('mqtt.sparkplugGroupId')}
          />
        )}
        {mqtt.profile === 'azure-iot-hub' && (
          <>
            <TextField
              type="password"
              value=""
              disabled
              placeholder={t('mqtt.azureSharedaccesskeyBase64')}
              className="font-mono"
              aria-label={t('mqtt.azureSharedaccesskeyBase64')}
            />
            <div className="flex items-center gap-2">
              <NumberField
                label={t('mqtt.tokenExpiryS')}
                min={300}
                max={31536000}
                value={mqtt.azureSasExpirySec ?? 3600}
                onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureSasExpirySec: parseInt(e.target.value, 10) || 3600 } })}
                className="w-24"
              />
            </div>
            <Checkbox
              checked={mqtt.azureTwinEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureTwinEnabled: e.target.checked } })}
              label={t('mqtt.deviceTwins')}
            />
            <Checkbox
              checked={mqtt.azureDirectMethodsEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDirectMethodsEnabled: e.target.checked } })}
              label={t('mqtt.directMethods')}
            />
            <Checkbox
              checked={mqtt.azureC2dEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureC2dEnabled: e.target.checked } })}
              label={t('mqtt.c2dMessaging')}
            />
            <Checkbox
              checked={mqtt.azureDpsEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEnabled: e.target.checked } })}
              label={t('mqtt.dps')}
            />
          </>
        )}
        {mqtt.profile === 'azure-iot-hub' && (
          <>
            <TextField
              value={mqtt.azureDpsIdScope ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsIdScope: e.target.value || undefined } })}
              placeholder={t('mqtt.azureDpsIdScope')}
              aria-label={t('mqtt.azureDpsIdScope')}
            />
            <TextField
              value={mqtt.azureDpsRegistrationId ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsRegistrationId: e.target.value || undefined } })}
              placeholder={t('mqtt.azureDpsRegistrationId')}
              aria-label={t('mqtt.azureDpsRegistrationId')}
            />
            <TextField
              value={mqtt.azureDpsEndpoint ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureDpsEndpoint: e.target.value || undefined } })}
              placeholder={t('mqtt.azureDpsEndpoint')}
              aria-label={t('mqtt.azureDpsEndpoint')}
            />
          </>
        )}
        {mqtt.profile === 'azure-event-grid-mqtt' && (
          <>
            <TextField
              value={mqtt.azureEventGridTopic ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridTopic: e.target.value || undefined } })}
              placeholder={t('mqtt.eventGridTopic')}
              aria-label={t('mqtt.eventGridTopic')}
            />
            <TextField
              value={mqtt.azureEventGridSource ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridSource: e.target.value || undefined } })}
              placeholder={t('mqtt.cloudeventSource')}
              aria-label={t('mqtt.cloudeventSource')}
            />
            <TextField
              value={mqtt.azureEventGridEventType ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, azureEventGridEventType: e.target.value || undefined } })}
              placeholder={t('mqtt.cloudeventType')}
              aria-label={t('mqtt.cloudeventType')}
            />
          </>
        )}
        {mqtt.profile === 'aws-iot-core' && (
          <>
            <Checkbox
              checked={mqtt.awsShadowEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsShadowEnabled: e.target.checked } })}
              label={t('mqtt.deviceShadows')}
            />
            <Checkbox
              checked={mqtt.awsJobsEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsJobsEnabled: e.target.checked } })}
              label={t('mqtt.iotJobs')}
            />
            <Checkbox
              checked={mqtt.awsFleetEnabled ?? false}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetEnabled: e.target.checked } })}
              label={t('mqtt.fleetProvisioning')}
            />
          </>
        )}
        {mqtt.profile === 'aws-iot-core' && (
          <>
            <TextField
              value={mqtt.awsFleetTemplateName ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsFleetTemplateName: e.target.value || undefined } })}
              placeholder={t('mqtt.fleetTemplateName')}
              aria-label={t('mqtt.fleetTemplateName')}
            />
            <TextField
              value={mqtt.awsClaimCertPath ?? ''}
              onChange={(e) => updateCommunication({ mqtt: { ...mqtt, awsClaimCertPath: e.target.value || undefined } })}
              placeholder={t('mqtt.claimCertPath')}
              aria-label={t('mqtt.claimCertPath')}
            />
            <TextField value="" disabled placeholder={t('mqtt.claimKeyPath')} aria-label={t('mqtt.claimKeyPath')} />
          </>
        )}
        <Select
          aria-label={t('mqtt.securityLevel')}
          value={mqtt.securityLevel}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, securityLevel: e.target.value as typeof mqtt.securityLevel } })}
        >
          <option value="none">{t('mqtt.noTls')}</option>
          <option value="tls-no-verify">{t('mqtt.tlsNoVerify')}</option>
          <option value="tls-server-verify">{t('mqtt.tlsServerVerify')}</option>
          <option value="tls-mutual">{t('mqtt.mutualTls')}</option>
        </Select>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-2">
        <NumberField
          min={5}
          max={3600}
          value={mqtt.keepAliveSec}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, keepAliveSec: parseInt(e.target.value, 10) || 60 } })}
          placeholder={t('mqtt.keepaliveS')}
          aria-label={t('mqtt.keepaliveS')}
        />
        <NumberField
          min={0}
          value={mqtt.sessionExpirySec}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, sessionExpirySec: parseInt(e.target.value, 10) || 0 } })}
          placeholder={t('mqtt.sessionExpiryS')}
          aria-label={t('mqtt.sessionExpiryS')}
        />
        <Select
          aria-label={t('mqtt.publishQos')}
          value={mqtt.publishQos}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}
        >
          <option value={0}>{t('mqtt.publishQos0')}</option>
          <option value={1}>{t('mqtt.publishQos1')}</option>
          <option value={2}>{t('mqtt.publishQos2')}</option>
        </Select>
        <Select
          aria-label={t('mqtt.subscribeQos')}
          value={mqtt.subscribeQos}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, subscribeQos: parseInt(e.target.value, 10) as 0 | 1 | 2 } })}
        >
          <option value={0}>{t('mqtt.subscribeQos0')}</option>
          <option value={1}>{t('mqtt.subscribeQos1')}</option>
          <option value={2}>{t('mqtt.subscribeQos2')}</option>
        </Select>
      </div>
      <div className="grid grid-cols-4 gap-3 mt-2">
        <Checkbox
          checked={mqtt.publishRetain}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, publishRetain: e.target.checked } })}
          label={t('mqtt.retainPublishes')}
        />
        <Checkbox
          checked={mqtt.cleanSession}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, cleanSession: e.target.checked } })}
          label={t('mqtt.cleanSession')}
        />
        <TextField
          value={mqtt.username || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, username: e.target.value || undefined } })}
          placeholder={t('mqtt.username')}
          aria-label={t('mqtt.username')}
        />
        <TextField type="password" value="" disabled placeholder={t('mqtt.password')} aria-label={t('mqtt.password')} />
      </div>
      <p className="text-xs text-[var(--color-surface-300)]">{t('mqtt.credentialsAndPrivateKey')}</p>
      <div className="grid grid-cols-4 gap-3 mt-2">
        <TextField
          value={mqtt.websocketPath || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, websocketPath: e.target.value || undefined } })}
          placeholder={t('mqtt.websocketPath')}
          aria-label={t('mqtt.websocketPath')}
        />
        <TextField
          value={mqtt.alpnProtocols || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, alpnProtocols: e.target.value || undefined } })}
          placeholder={t('mqtt.alpnProtocol')}
          aria-label={t('mqtt.alpnProtocol')}
        />
        <TextField
          value={mqtt.caCertPath || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, caCertPath: e.target.value || undefined } })}
          placeholder={t('mqtt.caCertPathPem')}
          aria-label={t('mqtt.caCertPathPem')}
        />
        <TextField
          value={mqtt.clientCertPath || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, clientCertPath: e.target.value || undefined } })}
          placeholder={t('mqtt.clientCertPath')}
          aria-label={t('mqtt.clientCertPath')}
        />
        <TextField value="" disabled placeholder={t('mqtt.clientKeyPath')} aria-label={t('mqtt.clientKeyPath')} />
      </div>
      <div className="grid grid-cols-5 gap-3 mt-2">
        <Checkbox
          checked={mqtt.lwtEnabled}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtEnabled: e.target.checked } })}
          label={t('mqtt.lastWill')}
        />
        <TextField
          value={mqtt.lwtTopic || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtTopic: e.target.value || undefined } })}
          placeholder={t('mqtt.lwtTopic')}
          aria-label={t('mqtt.lwtTopic')}
        />
        <TextField
          value={mqtt.lwtPayload || ''}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtPayload: e.target.value || undefined } })}
          placeholder={t('mqtt.lwtPayload')}
          aria-label={t('mqtt.lwtPayload')}
        />
        <Select
          aria-label={t('mqtt.lwtQos')}
          value={mqtt.lwtQos}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtQos: parseInt(e.target.value, 10) as 0 | 1 } })}
        >
          <option value={0}>{t('mqtt.lwtQos0')}</option>
          <option value={1}>{t('mqtt.lwtQos1')}</option>
        </Select>
        <Checkbox
          checked={mqtt.lwtRetain}
          onChange={(e) => updateCommunication({ mqtt: { ...mqtt, lwtRetain: e.target.checked } })}
          label={t('mqtt.retainLwt')}
        />
      </div>
    </div>
  );
}
