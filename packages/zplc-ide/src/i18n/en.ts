/**
 * The English catalog of Studio (UX-029): the source of truth for every user-visible string. A key is a dotted path
 * from the surface to the string; `{name}` marks a value the caller supplies, and a `.one` / `.other` pair is a plural
 * (`tn`). The Spanish catalog (`es.ts`) is typed against the keys written here, so a key added without its Spanish
 * text, or a Spanish key with no English one, does not compile. Text is in sentence case, without exclamation marks and
 * without internal terms (UX-031); tools/ci/i18n-guard.ts checks that as data.
 */
export const en = {
  'preferences.heading': 'Preferences',
  'preferences.tabSizeOption.one': '{count} space',
  'preferences.tabSizeOption.other': '{count} spaces',
  'updateNotice.available': 'ZPLC Studio {version} is available',
  // Preferences (the Settings surface)
  'preferences.intro': 'They apply to every project and are kept for your user account.',
  'preferences.fontSize': 'Editor font size',
  'preferences.fontSizeOption': '{size} px',
  'preferences.tabSize': 'Tab size',
  'preferences.density': 'Density',
  'preferences.density.comfortable': 'Comfortable',
  'preferences.density.compact': 'Compact',
  'preferences.language': 'Language',
  'preferences.language.auto': 'Automatic (system language)',
  'preferences.language.en': 'English',
  'preferences.language.es': 'Español',
  'preferences.autosave': 'Autosave',
  'preferences.autosave.off': 'Off',
  'preferences.autosave.after.one': 'After {count} second without typing',
  'preferences.autosave.after.other': 'After {count} seconds without typing',
  'preferences.updates.check': 'Check for a newer release when Studio starts',
  'preferences.updates.now': 'Check now',
  'preferences.updates.checking': 'Checking…',
  'preferences.updates.note': 'The check asks the GitHub releases of this project for the latest version. It sends nothing about you, downloads nothing and is off until you turn it on.',
  // Theme
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.highContrast': 'High contrast',
  // The answer of the update check
  'updateCheck.available': 'A newer release of ZPLC Studio is available: {latest} (this is {current}). {url}',
  'updateCheck.current': 'ZPLC Studio {current} is up to date (latest release: {latest}).',
  'updateCheck.unavailable': 'Could not check for updates. Check your network connection and try again.',
  // The update notice
  'updateNotice.label': 'A newer release of ZPLC Studio is available',
  'updateNotice.thisIs': '(this is {current}).',
  'updateNotice.release': 'Release:',
  'updateNotice.dismiss': 'Dismiss',
  'updateNotice.dismissLabel': 'Dismiss the notice about ZPLC Studio {version}',
  'updateNotice.howTo': 'How to update',
  'updateNotice.untouched': 'Studio does not download or install anything. Your projects are folders you chose, so an update does not touch them.',
  'updateNotice.step.win32Setup': 'Setup: download the new `setup-unsigned.exe` file, check its checksum and run it over the installed version.',
  'updateNotice.step.win32Portable': 'Portable: download the new `portable-unsigned.exe` file and replace the old one.',
  'updateNotice.step.darwin': 'Download the new `.dmg` (or `.zip`) file, check its checksum and drag the new application into "Applications", replacing the old one.',
  'updateNotice.step.deb': '`.deb`: download the new package, check its checksum and install it with `sudo apt install ./<file>.deb`.',
  'updateNotice.step.rpm': '`.rpm`: download the new package, check its checksum and install it with `sudo dnf install ./<file>.rpm`.',
  'updateNotice.step.appImage': 'AppImage: download the new file, check its checksum and replace the old one.',
  'updateNotice.step.other': 'Download the new installer of your system from the release, check its checksum and install it over the old one.',
  // Serial port dialog
  'serialPort.title': 'Choose a serial port',
  'serialPort.intro': 'Studio uses only the port you choose, for this connection. Choosing a port does not send a program or start anything.',
  'serialPort.empty': 'No serial port was found. Plug in the board, then choose "Refresh".',
  'serialPort.list': 'Serial ports',
  'serialPort.noUsbId': 'No USB identifiers',
  'serialPort.usb': 'USB {id}',
  'serialPort.serialNumber': 'serial number {serial}',
  'serialPort.refresh': 'Refresh',
  'serialPort.refreshing': 'Refreshing…',
  'serialPort.use': 'Use this port',
  'serialPort.knownBoards': 'Known boards with these USB identifiers: {boards}. The port does not say which one it is.',
  'serialPort.knownBoard': 'Known board: {board}',
  'serialPort.vendor': 'USB vendor: {vendor}',
  // Words shared by several surfaces
  'common.cancel': 'Cancel',
} as const;

export type MessageKey = keyof typeof en;
