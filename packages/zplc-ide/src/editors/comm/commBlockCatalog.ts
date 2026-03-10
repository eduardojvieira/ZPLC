export interface CommBlockPort {
  name: string;
  direction: 'IN' | 'OUT';
  dataType: string;
  required: boolean;
}

export interface CommBlockDef {
  kind: number;
  name: string;
  label: string;
  category: 'modbus' | 'mqtt' | 'azure' | 'aws' | 'generic';
  phase: 1 | 2 | 3;
  ports: CommBlockPort[];
}

const MB_HEADER_PORTS: CommBlockPort[] = [
  { name: 'EN', direction: 'IN', dataType: 'BOOL', required: false },
  { name: 'BUSY', direction: 'OUT', dataType: 'BOOL', required: false },
  { name: 'DONE', direction: 'OUT', dataType: 'BOOL', required: false },
  { name: 'ERROR', direction: 'OUT', dataType: 'BOOL', required: false },
  { name: 'STATUS', direction: 'OUT', dataType: 'DINT', required: false },
  { name: 'PROTO', direction: 'IN', dataType: 'USINT', required: true },
  { name: 'SLAVE_ID', direction: 'IN', dataType: 'UINT', required: true },
  { name: 'ADDR', direction: 'IN', dataType: 'UINT', required: true },
];

const MB_TCP_PORTS: CommBlockPort[] = [
  { name: 'HOST', direction: 'IN', dataType: 'STRING', required: false },
  { name: 'PORT', direction: 'IN', dataType: 'UINT', required: false },
];

export const COMM_BLOCK_CATALOG: CommBlockDef[] = [
  {
    kind: 0x0001,
    name: 'MB_READ_HREG',
    label: 'Modbus Read Word',
    category: 'modbus',
    phase: 1,
    ports: [
      ...MB_HEADER_PORTS,
      { name: 'COUNT', direction: 'IN', dataType: 'UINT', required: true },
      { name: 'VALUE', direction: 'OUT', dataType: 'UINT', required: false },
      ...MB_TCP_PORTS
    ]
  },
  {
    kind: 0x0002,
    name: 'MB_WRITE_HREG',
    label: 'Modbus Write Word',
    category: 'modbus',
    phase: 1,
    ports: [
      ...MB_HEADER_PORTS,
      { name: 'COUNT', direction: 'IN', dataType: 'UINT', required: true },
      { name: 'VALUE', direction: 'IN', dataType: 'UINT', required: true },
      ...MB_TCP_PORTS
    ]
  },
  {
    kind: 0x0003,
    name: 'MB_READ_COIL',
    label: 'Modbus Read Bit',
    category: 'modbus',
    phase: 1,
    ports: [
      ...MB_HEADER_PORTS,
      { name: 'COUNT', direction: 'IN', dataType: 'UINT', required: true },
      { name: 'VALUE', direction: 'OUT', dataType: 'BOOL', required: false },
      ...MB_TCP_PORTS
    ]
  },
  {
    kind: 0x0004,
    name: 'MB_WRITE_COIL',
    label: 'Modbus Write Bit',
    category: 'modbus',
    phase: 1,
    ports: [
      ...MB_HEADER_PORTS,
      { name: 'COUNT', direction: 'IN', dataType: 'UINT', required: true },
      { name: 'VALUE', direction: 'IN', dataType: 'BOOL', required: true },
      ...MB_TCP_PORTS
    ]
  },
  {
    kind: 0x000A,
    name: 'MQTT_CONNECT',
    label: 'MQTT Connect',
    category: 'mqtt',
    phase: 2,
    ports: [
      { name: 'EN', direction: 'IN', dataType: 'BOOL', required: false },
      { name: 'BUSY', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'DONE', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'ERROR', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'STATUS', direction: 'OUT', dataType: 'DINT', required: false },
      { name: 'PROFILE', direction: 'IN', dataType: 'USINT', required: true },
      { name: 'CONNECTED', direction: 'OUT', dataType: 'BOOL', required: false },
    ]
  },
  {
    kind: 0x000B,
    name: 'MQTT_PUBLISH',
    label: 'MQTT Publish',
    category: 'mqtt',
    phase: 2,
    ports: [
      { name: 'EN', direction: 'IN', dataType: 'BOOL', required: false },
      { name: 'BUSY', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'DONE', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'ERROR', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'STATUS', direction: 'OUT', dataType: 'DINT', required: false },
      { name: 'QOS', direction: 'IN', dataType: 'USINT', required: true },
      { name: 'RETAIN', direction: 'IN', dataType: 'BOOL', required: true },
      { name: 'TOPIC', direction: 'IN', dataType: 'STRING', required: true },
      { name: 'PAYLOAD', direction: 'IN', dataType: 'STRING', required: true },
    ]
  },
  {
    kind: 0x000C,
    name: 'MQTT_SUBSCRIBE',
    label: 'MQTT Subscribe',
    category: 'mqtt',
    phase: 2,
    ports: [
      { name: 'EN', direction: 'IN', dataType: 'BOOL', required: false },
      { name: 'BUSY', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'DONE', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'ERROR', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'STATUS', direction: 'OUT', dataType: 'DINT', required: false },
      { name: 'QOS', direction: 'IN', dataType: 'USINT', required: true },
      { name: 'VALID', direction: 'OUT', dataType: 'BOOL', required: false },
      { name: 'TOPIC', direction: 'IN', dataType: 'STRING', required: true },
      { name: 'PAYLOAD', direction: 'OUT', dataType: 'STRING', required: false },
    ]
  }
];
