/** Text of milestone U2 of spec 013 for project search across the five languages (plan-u2.md, task R3). */
export const u2SearchEn = {
  'search.scopeAll':
    'Searches the text of structured text and instruction list files, and the names, variables, comments and expressions of ' +
    'ladder, function block and sequential function chart diagrams, with the changes that are not saved.',
  'search.noneSearched': 'No results in {files} files searched',
  'search.openPlace': 'Open {file}, {place}',
  'search.table': "Variable table, row '{name}'",
} as const;
export const u2SearchEs: Record<keyof typeof u2SearchEn, string> = {
  'search.scopeAll':
    'Busca en el texto de los archivos de texto estructurado y de lista de instrucciones, y en los nombres, variables, comentarios y ' +
    'expresiones de los diagramas de escalera, de bloques de función y de gráfico de funciones secuenciales, con los cambios sin guardar.',
  'search.noneSearched': 'Sin resultados en {files} archivos buscados',
  'search.openPlace': 'Abrir {file}, {place}',
  'search.table': "Tabla de variables, fila '{name}'",
};
