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
  getStatus,
  resetDevice,
  getVersion,
  type SerialConnection,
  type ProgressCallback,
} from './webserial';
