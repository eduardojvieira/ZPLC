// The pure part of the browser flasher of the ESP32-S3 (REL-024): the names of the release image, the manifest that
// ESP Web Tools reads, the check of the browser, and the texts of the two languages of the site. Nothing here touches a
// serial port: the flash is started by a person, in the browser, after the person chose the file and pressed Install.

/** The board of firmware/app/boards/boards.json that this flasher writes, and the format of its release image. */
export const ESP32S3_BOARD = 'esp32-s3-devkitc';
export const IMAGE_EXTENSION = 'bin';
/** Where the merged image (bootloader and application) is written: `images[].flash.address` of the release manifest, 0x0. */
export const ESP32S3_OFFSET = 0;

/** `zplc-runtime-<version>-<board>.<ext>`, the name that the release pipeline gives the image (scripts/release/firmware-images.ts). */
export const imageFileName = (version: string): string => `zplc-runtime-${version}-${ESP32S3_BOARD}.${IMAGE_EXTENSION}`;

const IMAGE_NAME = new RegExp(`^zplc-runtime-(.+)-${ESP32S3_BOARD}\\.${IMAGE_EXTENSION}$`);

/** The version of a downloaded file, or undefined when the file is not the ESP32-S3 image of a release. */
export const versionOfImage = (fileName: string): string | undefined => IMAGE_NAME.exec(fileName)?.[1];

export interface FlashManifest {
  name: string;
  version: string;
  new_install_prompt_erase: boolean;
  builds: { chipFamily: 'ESP32-S3'; parts: { path: string; offset: number }[] }[];
}

/** The manifest of ESP Web Tools for one image. The flash is not erased unless the person ticks the box of the dialog. */
export function buildFlashManifest({ version, imageUrl }: { version: string; imageUrl: string }): FlashManifest {
  return {
    name: 'ZPLC runtime for the ESP32-S3-DevKitC-1',
    version,
    new_install_prompt_erase: false,
    builds: [{ chipFamily: 'ESP32-S3', parts: [{ path: imageUrl, offset: ESP32S3_OFFSET }] }],
  };
}

/** Web Serial: Chrome and Edge on a computer. Firefox, Safari and the phones do not have it. */
export const webSerialSupported = (navigatorLike: { serial?: unknown } | undefined): boolean =>
  navigatorLike !== undefined && 'serial' in navigatorLike;

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export interface Text {
  title: string;
  safety: string;
  unsupported: string;
  checking: string;
  choose: string;
  wrongFile: string;
  checksum: string;
  install: string;
  notAllowed: string;
  steps: string;
}

export const TEXT: Record<'en' | 'es', Text> = {
  en: {
    title: 'Flash the ESP32-S3 from the browser',
    safety:
      "AI never flashes. ZPLC's assistant and the MCP server never write a board. You start every step: you choose the file, you press " +
      'Install, you pick the serial port in the dialog of the browser, and you confirm.',
    unsupported:
      'The browser flasher needs Web Serial, which only Chrome and Edge on a computer have. Use one of them, or write the image with the ' +
      'command line below.',
    checking:
      'Checking the browser. The flasher needs JavaScript and Web Serial (Chrome and Edge on a computer); the command line below works ' +
      'everywhere.',
    choose: 'Image of the release (zplc-runtime-<version>-esp32-s3-devkitc.bin)',
    wrongFile: 'This file is not the ESP32-S3 image of a release. Its name must be zplc-runtime-<version>-esp32-s3-devkitc.bin.',
    checksum: 'SHA-256 of this file. Compare it with the line of SHA256SUMS before you install:',
    install: 'Install the image at address 0x0',
    notAllowed: 'The browser does not allow Web Serial on this page. Open the page over HTTPS, in Chrome or Edge.',
    steps: 'Put the board in download mode first (hold BOOT, press RST, release BOOT), connected to the USB port of the ESP32-S3.',
  },
  es: {
    title: 'Grabe el ESP32-S3 desde el navegador',
    safety:
      'La IA nunca graba una placa: ni el asistente de ZPLC ni el servidor MCP lo hacen. Usted inicia cada paso: elige el archivo, pulsa ' +
      'Instalar, elige el puerto serie en el diálogo del navegador y confirma.',
    unsupported:
      'El grabador del navegador necesita Web Serial, que solo tienen Chrome y Edge en una computadora. Use uno de ellos, o grabe la ' +
      'imagen con la línea de comandos que sigue.',
    checking:
      'Comprobando el navegador. El grabador necesita JavaScript y Web Serial (Chrome y Edge en una computadora); la línea de comandos ' +
      'que sigue funciona en cualquier navegador.',
    choose: 'Imagen de la versión (zplc-runtime-<versión>-esp32-s3-devkitc.bin)',
    wrongFile: 'Este archivo no es la imagen del ESP32-S3 de una versión. Su nombre debe ser zplc-runtime-<versión>-esp32-s3-devkitc.bin.',
    checksum: 'SHA-256 de este archivo. Compárelo con la línea de SHA256SUMS antes de instalar:',
    install: 'Instalar la imagen en la dirección 0x0',
    notAllowed: 'El navegador no permite Web Serial en esta página. Abra la página por HTTPS, en Chrome o Edge.',
    steps: 'Primero ponga la placa en modo de descarga (mantenga BOOT, pulse RST, suelte BOOT), conectada al puerto USB del ESP32-S3.',
  },
};
