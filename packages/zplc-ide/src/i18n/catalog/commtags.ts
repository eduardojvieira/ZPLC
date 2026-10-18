/** The text of one surface, in English and in Spanish (UX-029, UX-030). Keys `commtags.*`. */
export const commtagsEn = {
  // CommunicationTags.tsx
  'commtags.communicationTags': 'Communication tags',
  'commtags.addTag': 'Add tag',
  'commtags.noCommunicationTagsConfigured': 'No communication tags configured.',
  'commtags.symbol': 'Symbol',
  'commtags.bindings': 'Bindings',
  'commtags.uint': 'UINT',
  'commtags.pub': 'pub',
  'commtags.sub': 'sub',
  'commtags.modbusAddress': 'Modbus address',
  'commtags.modbusArea': 'Modbus area',
  'commtags.coil': 'Coil',
  'commtags.discreteInput': 'Discrete input',
  'commtags.inputRegister': 'Input register',
  'commtags.holdingRegister': 'Holding register',
  'commtags.removeTag': 'Remove tag {value}',
} as const;

export const commtagsEs: Record<keyof typeof commtagsEn, string> = {
  // CommunicationTags.tsx
  'commtags.communicationTags': 'Etiquetas de comunicación',
  'commtags.addTag': 'Agregar etiqueta',
  'commtags.noCommunicationTagsConfigured': 'No hay etiquetas de comunicación configuradas.',
  'commtags.symbol': 'Símbolo',
  'commtags.bindings': 'Enlaces',
  'commtags.uint': 'UINT',
  'commtags.pub': 'pub.',
  'commtags.sub': 'sus.',
  'commtags.modbusAddress': 'Dirección Modbus',
  'commtags.modbusArea': 'Área Modbus',
  'commtags.coil': 'Bobina',
  'commtags.discreteInput': 'Entrada discreta',
  'commtags.inputRegister': 'Registro de entrada',
  'commtags.holdingRegister': 'Registro de retención',
  'commtags.removeTag': 'Quitar la etiqueta {value}',
};
