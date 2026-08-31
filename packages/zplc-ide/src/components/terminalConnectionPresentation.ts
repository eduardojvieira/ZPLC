export function terminalDisconnectMessage(succeeded: boolean): string {
  return succeeded
    ? '\n[Disconnected]\n'
    : '\n[Connection close failed. Verify device state before operating.]\n';
}
