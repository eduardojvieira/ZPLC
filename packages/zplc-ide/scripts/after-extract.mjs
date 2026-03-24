import { cleanupMacExtendedAttributes } from './mac-xattr-cleanup.mjs';

/**
 * electron-builder afterExtract hook.
 * Clears macOS extended attributes from extracted Electron artifacts before packaging/signing.
 *
 * @param {{ electronPlatformName: string; appOutDir?: string; packager?: { projectDir?: string } }} context
 */
export default async function afterExtract(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  cleanupMacExtendedAttributes(
    [context.appOutDir, context.packager?.projectDir],
    'afterExtract',
  );
}
