const requiredMacSigningFields = [
  'ZPLC_MACOS_CSC_LINK',
  'ZPLC_MACOS_CSC_KEY_PASSWORD',
  'ZPLC_APPLE_API_KEY_P8',
  'ZPLC_APPLE_API_KEY_ID',
  'ZPLC_APPLE_API_ISSUER',
  'ZPLC_APPLE_TEAM_ID',
];

const maxNotaryResponseBytes = 64 * 1024;

export function requireMacReleaseSigning(env) {
  const missing = requiredMacSigningFields.filter((field) => !env[field]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing macOS release-signing configuration: ${missing.join(', ')}`);
  }
}

export function requireAcceptedNotaryResponse(response) {
  if (typeof response !== 'string' || Buffer.byteLength(response) > maxNotaryResponseBytes) {
    throw new Error('macOS DMG notarization was not accepted');
  }
  try {
    if (JSON.parse(response).status === 'Accepted') return;
  } catch {
    // The notarization service response is intentionally not exposed to logs.
  }
  throw new Error('macOS DMG notarization was not accepted');
}
