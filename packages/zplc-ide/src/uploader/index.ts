/**
 * WebSerial Uploader Module
 * 
 * Provides functionality to upload ZPLC bytecode to devices via WebSerial.
 */

export {
  isWebSerialSupported,
  requestPort,
  connect,
  disconnect,
  uploadBytecode,
  uploadCertificates,
  getStatus,
  resetDevice,
  getVersion,
  type CertificateUploadBundle,
  type SerialConnection,
  type ProgressCallback,
} from './webserial';
