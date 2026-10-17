import type { MessageKey } from './en';

/**
 * The Spanish catalog (UX-029, UX-030): neutral Latin American Spanish with impersonal or "usted" forms, as in
 * industrial manuals (decision D-10); no voseo. `Record<MessageKey, string>` makes a missing or extra key a compile error.
 */
export const es: Record<MessageKey, string> = {
  'preferences.heading': 'Preferencias',
  'preferences.tabSizeOption.one': '{count} espacio',
  'preferences.tabSizeOption.other': '{count} espacios',
  'updateNotice.available': 'ZPLC Studio {version} está disponible',
  // Preferences (the Settings surface)
  'preferences.intro': 'Se aplican a todos los proyectos y se conservan en su cuenta de usuario.',
  'preferences.fontSize': 'Tamaño de fuente del editor',
  'preferences.fontSizeOption': '{size} px',
  'preferences.tabSize': 'Tamaño de tabulación',
  'preferences.density': 'Densidad',
  'preferences.density.comfortable': 'Cómoda',
  'preferences.density.compact': 'Compacta',
  'preferences.language': 'Idioma',
  'preferences.language.auto': 'Automático (idioma del sistema)',
  'preferences.language.en': 'English',
  'preferences.language.es': 'Español',
  'preferences.autosave': 'Autoguardado',
  'preferences.autosave.off': 'Desactivado',
  'preferences.autosave.after.one': 'Después de {count} segundo sin escribir',
  'preferences.autosave.after.other': 'Después de {count} segundos sin escribir',
  'preferences.updates.check': 'Buscar una versión más reciente al iniciar Studio',
  'preferences.updates.now': 'Buscar ahora',
  'preferences.updates.checking': 'Buscando…',
  'preferences.updates.note': 'La búsqueda consulta las versiones publicadas de este proyecto en GitHub. No envía datos suyos, no descarga nada y permanece desactivada hasta que usted la active.',
  // Theme
  'theme.label': 'Tema',
  'theme.light': 'Claro',
  'theme.dark': 'Oscuro',
  'theme.highContrast': 'Alto contraste',
  // The answer of the update check
  'updateCheck.available': 'Hay una versión más reciente de ZPLC Studio disponible: {latest} (la instalada es {current}). {url}',
  'updateCheck.current': 'ZPLC Studio {current} está al día (última versión publicada: {latest}).',
  'updateCheck.unavailable': 'No se pudo buscar actualizaciones. Verifique la conexión de red e intente de nuevo.',
  // The update notice
  'updateNotice.label': 'Hay una versión más reciente de ZPLC Studio disponible',
  'updateNotice.thisIs': '(la instalada es {current}).',
  'updateNotice.release': 'Versión publicada:',
  'updateNotice.dismiss': 'Descartar',
  'updateNotice.dismissLabel': 'Descartar el aviso sobre ZPLC Studio {version}',
  'updateNotice.howTo': 'Cómo actualizar',
  'updateNotice.untouched': 'Studio no descarga ni instala nada. Sus proyectos son carpetas que usted eligió, por lo que una actualización no las modifica.',
  'updateNotice.step.win32Setup': 'Instalador: descargue el nuevo archivo `setup-unsigned.exe`, verifique su suma de comprobación y ejecútelo sobre la versión instalada.',
  'updateNotice.step.win32Portable': 'Portátil: descargue el nuevo archivo `portable-unsigned.exe` y reemplace el anterior.',
  'updateNotice.step.darwin': 'Descargue el nuevo archivo `.dmg` (o `.zip`), verifique su suma de comprobación y arrastre la nueva aplicación a "Aplicaciones", reemplazando la anterior.',
  'updateNotice.step.deb': '`.deb`: descargue el nuevo paquete, verifique su suma de comprobación e instálelo con `sudo apt install ./<file>.deb`.',
  'updateNotice.step.rpm': '`.rpm`: descargue el nuevo paquete, verifique su suma de comprobación e instálelo con `sudo dnf install ./<file>.rpm`.',
  'updateNotice.step.appImage': 'AppImage: descargue el nuevo archivo, verifique su suma de comprobación y reemplace el anterior.',
  'updateNotice.step.other': 'Descargue desde la versión publicada el nuevo instalador de su sistema, verifique su suma de comprobación e instálelo sobre el anterior.',
  // Serial port dialog
  'serialPort.title': 'Elegir un puerto serie',
  'serialPort.intro': 'Studio usa solamente el puerto que usted elija, para esta conexión. Elegir un puerto no envía ningún programa ni inicia nada.',
  'serialPort.empty': 'No se encontró ningún puerto serie. Conecte la placa y luego elija "Actualizar".',
  'serialPort.list': 'Puertos serie',
  'serialPort.noUsbId': 'Sin identificadores USB',
  'serialPort.usb': 'USB {id}',
  'serialPort.serialNumber': 'número de serie {serial}',
  'serialPort.refresh': 'Actualizar',
  'serialPort.refreshing': 'Actualizando…',
  'serialPort.use': 'Usar este puerto',
  'serialPort.knownBoards': 'Placas conocidas con estos identificadores USB: {boards}. El puerto no indica cuál es.',
  'serialPort.knownBoard': 'Placa conocida: {board}',
  'serialPort.vendor': 'Fabricante USB: {vendor}',
  // Words shared by several surfaces
  'common.cancel': 'Cancelar',
};
