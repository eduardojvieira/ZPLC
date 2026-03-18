import type { ZPLCProjectConfig } from '../types';

export interface ProvisioningCommandOptions {
  quoteShellArg: (value: string) => string;
}

function mqttSecurityToRuntimeLevel(level: string | undefined): number {
  if (level === 'tls-no-verify') return 1;
  if (level === 'tls-server-verify') return 2;
  if (level === 'tls-mutual') return 3;
  return 0;
}

function mqttProfileToRuntimeLevel(profile: string | undefined): number {
  switch (profile) {
    case 'generic-broker': return 1;
    case 'aws-iot-core': return 2;
    case 'azure-iot-hub': return 3;
    case 'azure-event-grid-mqtt': return 4;
    case 'sparkplug-b':
    default:
      return 0;
  }
}

function mqttProtocolToRuntimeLevel(version: string | undefined): number {
  return version === '3.1.1' ? 0 : 1;
}

function mqttTransportToRuntimeLevel(transport: string | undefined): number {
  switch (transport) {
    case 'tls': return 1;
    case 'ws': return 2;
    case 'wss': return 3;
    case 'tcp':
    default:
      return 0;
  }
}

function modbusParityToRuntimeLevel(parity: string | undefined): number {
  switch (parity) {
    case 'even': return 1;
    case 'odd': return 2;
    case 'none':
    default:
      return 0;
  }
}

export function buildProvisioningCommands(
  projectConfig: ZPLCProjectConfig,
  options: ProvisioningCommandOptions,
): string[] {
  const commands: string[] = [];
  const quote = options.quoteShellArg;

  const network = projectConfig.network;
  const communication = projectConfig.communication;

  if (network?.hostname) {
    commands.push(`zplc config set hostname ${quote(network.hostname)}`);
  }

  const wifiEnabled = network?.wifi?.enabled;
  const ethEnabled = network?.ethernet?.enabled;
  const ipv4 = (wifiEnabled && network?.wifi?.ipv4) || (ethEnabled && network?.ethernet?.ipv4) || null;
  if (ipv4) {
    commands.push(`zplc config set dhcp ${ipv4.dhcp ? '1' : '0'}`);
    if (!ipv4.dhcp && ipv4.ip) {
      commands.push(`zplc config set ip ${quote(ipv4.ip)}`);
    }
  }

  if (network?.wifi?.enabled && network.wifi.ssid) {
    commands.push(`zplc config set wifi_ssid ${quote(network.wifi.ssid)}`);
    commands.push(`zplc config set wifi_security ${network.wifi.security === 'open' ? 0 : 1}`);
    if (network.wifi.security !== 'open' && network.wifi.password) {
      commands.push(`zplc config set wifi_pass ${quote(network.wifi.password)}`);
    }
  }

  const modbus = communication?.modbus;
  const modbusClient = modbus?.client;
  const modbusEnabled = modbus?.enabled ?? false;
  if (modbus) {
    commands.push(`zplc config set modbus_id ${modbus.unitId}`);
    commands.push(`zplc config set modbus_tcp_port ${modbus.tcpPort}`);
    commands.push(`zplc config set modbus_rtu_baud ${modbus.rtuBaud}`);
    commands.push(`zplc config set modbus_rtu_parity ${modbusParityToRuntimeLevel(modbus.rtuParity)}`);
  }
  commands.push(`zplc config set modbus_tcp_enabled ${modbusEnabled && (modbus?.tcpEnabled ?? false) ? '1' : '0'}`);
  commands.push(`zplc config set modbus_rtu_enabled ${modbusEnabled && (modbus?.rtuEnabled ?? false) ? '1' : '0'}`);
  commands.push(`zplc config set modbus_rtu_client_enabled ${modbusEnabled && (modbusClient?.rtuClientEnabled ?? false) ? '1' : '0'}`);
  commands.push(`zplc config set modbus_tcp_client_enabled ${modbusEnabled && (modbusClient?.tcpClientEnabled ?? false) ? '1' : '0'}`);
  if (modbusClient) {
    commands.push(`zplc config set modbus_rtu_client_slave_id ${modbusClient.rtuClientSlaveId}`);
    commands.push(`zplc config set modbus_rtu_client_poll_ms ${modbusClient.rtuClientPollMs}`);
    commands.push(`zplc config set modbus_tcp_client_host ${quote(modbusClient.tcpClientHost)}`);
    commands.push(`zplc config set modbus_tcp_client_port ${modbusClient.tcpClientPort}`);
    commands.push(`zplc config set modbus_tcp_client_unit_id ${modbusClient.tcpClientUnitId}`);
    commands.push(`zplc config set modbus_tcp_client_poll_ms ${modbusClient.tcpClientPollMs}`);
    commands.push(`zplc config set modbus_tcp_client_timeout_ms ${modbusClient.tcpClientTimeoutMs}`);
  }

  const mqtt = communication?.mqtt;
  const mqttEnabled = mqtt?.enabled ?? false;
  commands.push(`zplc config set mqtt_enabled ${mqttEnabled ? '1' : '0'}`);
  if (mqtt) {
    commands.push(`zplc config set mqtt_broker ${quote(mqtt.broker)}`);
    commands.push(`zplc config set mqtt_client_id ${quote(mqtt.clientId)}`);
    commands.push(`zplc config set mqtt_topic_namespace ${quote(mqtt.topicNamespace)}`);
    commands.push(`zplc config set mqtt_profile ${mqttProfileToRuntimeLevel(mqtt.profile)}`);
    commands.push(`zplc config set mqtt_protocol ${mqttProtocolToRuntimeLevel(mqtt.protocolVersion)}`);
    commands.push(`zplc config set mqtt_transport ${mqttTransportToRuntimeLevel(mqtt.transport)}`);
    commands.push(`zplc config set mqtt_port ${mqtt.port}`);
    commands.push(`zplc config set mqtt_keepalive ${mqtt.keepAliveSec}`);
    commands.push(`zplc config set mqtt_publish_interval ${mqtt.publishIntervalMs}`);
    commands.push(`zplc config set mqtt_publish_qos ${mqtt.publishQos}`);
    commands.push(`zplc config set mqtt_subscribe_qos ${mqtt.subscribeQos}`);
    commands.push(`zplc config set mqtt_publish_retain ${mqtt.publishRetain ? '1' : '0'}`);
    commands.push(`zplc config set mqtt_clean_session ${mqtt.cleanSession ? '1' : '0'}`);
    commands.push(`zplc config set mqtt_session_expiry ${mqtt.sessionExpirySec}`);
    commands.push(`zplc config set mqtt_security ${mqttSecurityToRuntimeLevel(mqtt.securityLevel)}`);
    commands.push(`zplc config set mqtt_websocket_path ${quote(mqtt.websocketPath ?? '')}`);
    commands.push(`zplc config set mqtt_alpn ${quote(mqtt.alpnProtocols ?? '')}`);
    commands.push(`zplc config set mqtt_lwt_enabled ${mqtt.lwtEnabled ? '1' : '0'}`);
    commands.push(`zplc config set mqtt_lwt_topic ${quote(mqtt.lwtTopic ?? '')}`);
    commands.push(`zplc config set mqtt_lwt_payload ${quote(mqtt.lwtPayload ?? '')}`);
    commands.push(`zplc config set mqtt_lwt_qos ${mqtt.lwtQos}`);
    commands.push(`zplc config set mqtt_lwt_retain ${mqtt.lwtRetain ? '1' : '0'}`);
    commands.push(`zplc config set mqtt_username ${quote(mqtt.username ?? '')}`);
    commands.push(`zplc config set mqtt_password ${quote(mqtt.password ?? '')}`);
    commands.push(`zplc config set mqtt_ca_cert_path ${quote(mqtt.caCertPath ?? '')}`);
    commands.push(`zplc config set mqtt_client_cert_path ${quote(mqtt.clientCertPath ?? '')}`);
    commands.push(`zplc config set mqtt_client_key_path ${quote(mqtt.clientKeyPath ?? '')}`);
    commands.push(`zplc config set azure_sas_key ${quote(mqtt.azureSasKey ?? '')}`);
    commands.push(`zplc config set azure_sas_expiry_s ${mqtt.azureSasExpirySec ?? 3600}`);
    commands.push(`zplc config set azure_twin_enabled ${mqtt.azureTwinEnabled ? '1' : '0'}`);
    commands.push(`zplc config set azure_direct_methods_enabled ${mqtt.azureDirectMethodsEnabled ? '1' : '0'}`);
    commands.push(`zplc config set azure_c2d_enabled ${mqtt.azureC2dEnabled ? '1' : '0'}`);
    commands.push(`zplc config set azure_dps_enabled ${mqtt.azureDpsEnabled ? '1' : '0'}`);
    commands.push(`zplc config set azure_dps_id_scope ${quote(mqtt.azureDpsIdScope ?? '')}`);
    commands.push(`zplc config set azure_dps_registration_id ${quote(mqtt.azureDpsRegistrationId ?? '')}`);
    commands.push(`zplc config set azure_dps_endpoint ${quote(mqtt.azureDpsEndpoint ?? '')}`);
    commands.push(`zplc config set azure_event_grid_topic ${quote(mqtt.azureEventGridTopic ?? '')}`);
    commands.push(`zplc config set azure_event_grid_source ${quote(mqtt.azureEventGridSource ?? '')}`);
    commands.push(`zplc config set azure_event_grid_event_type ${quote(mqtt.azureEventGridEventType ?? '')}`);
    commands.push(`zplc config set aws_shadow_enabled ${mqtt.awsShadowEnabled ? '1' : '0'}`);
    commands.push(`zplc config set aws_jobs_enabled ${mqtt.awsJobsEnabled ? '1' : '0'}`);
    commands.push(`zplc config set aws_fleet_enabled ${mqtt.awsFleetEnabled ? '1' : '0'}`);
    commands.push(`zplc config set aws_fleet_template_name ${quote(mqtt.awsFleetTemplateName ?? '')}`);
    commands.push(`zplc config set aws_claim_cert_path ${quote(mqtt.awsClaimCertPath ?? '')}`);
    commands.push(`zplc config set aws_claim_key_path ${quote(mqtt.awsClaimKeyPath ?? '')}`);
  }

  commands.push('zplc config save');

  return commands;
}
