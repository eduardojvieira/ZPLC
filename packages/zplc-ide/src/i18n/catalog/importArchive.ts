/** The text of one surface, in English and in Spanish (UX-029, UX-030). Keys `importArchive.*`. */
export const importArchiveEn = {
  'importArchive.holds': 'holds {files} and {folders}, {size}. Nothing has been written. Importing asks for an empty folder and puts the project there.',
  'importArchive.files.one': '{count} file',
  'importArchive.files.other': '{count} files',
  'importArchive.folders.one': '{count} folder',
  'importArchive.folders.other': '{count} folders',
  // ImportArchive.tsx
  'importArchive.readingTheArchive': 'Reading the archive…',
  'importArchive.importAProjectArchive': 'Import a project archive…',
  'importArchive.importAProjectArchive2': 'Import a project archive',
  'importArchive.version': ', version',
  'importArchive.projectFormat': ', project format',
  'importArchive.1ItMigratesTo': '1 (it migrates to 2 when you save)',
  'importArchive.theFilesAreImported': 'The files are imported as they are. Opened, this project is migrated in memory; saving writes this difference to zplc.json:',
  'importArchive.importing': 'Importing…',
  'importArchive.chooseAFolderAnd': 'Choose a folder and import',
} as const;

export const importArchiveEs: Record<keyof typeof importArchiveEn, string> = {
  'importArchive.holds': 'contiene {files} y {folders}, {size}. No se ha escrito nada. Al importar se pide una carpeta vacía y el proyecto se guarda allí.',
  'importArchive.files.one': '{count} archivo',
  'importArchive.files.other': '{count} archivos',
  'importArchive.folders.one': '{count} carpeta',
  'importArchive.folders.other': '{count} carpetas',
  // ImportArchive.tsx
  'importArchive.readingTheArchive': 'Leyendo el archivo…',
  'importArchive.importAProjectArchive': 'Importar un archivo de proyecto…',
  'importArchive.importAProjectArchive2': 'Importar un archivo de proyecto',
  'importArchive.version': ', versión',
  'importArchive.projectFormat': ', formato del proyecto',
  'importArchive.1ItMigratesTo': '1 (se migra a 2 al guardar)',
  'importArchive.theFilesAreImported': 'Los archivos se importan tal cual. Al abrirlo, este proyecto se migra en memoria; al guardar, esta diferencia se escribe en zplc.json:',
  'importArchive.importing': 'Importando…',
  'importArchive.chooseAFolderAnd': 'Elegir una carpeta e importar',
};
