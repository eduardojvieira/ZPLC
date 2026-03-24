import { cleanupMacExtendedAttributes } from './mac-xattr-cleanup.mjs';

/**
 * electron-builder afterPack hook.
 * Clears macOS extended attributes from the packaged app bundle before codesign.
 *
 * @param {{ electronPlatformName: string; appOutDir?: string; packager?: { appInfo?: { productFilename?: string }, projectDir?: string } }} context
 */
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const productFilename = context.packager?.appInfo?.productFilename;
  cleanupMacExtendedAttributes(
    [
      context.appOutDir,
      productFilename && context.appOutDir ? `${context.appOutDir}/${productFilename}.app` : '',
      context.packager?.projectDir,
    ],
    'afterPack',
  );
}
