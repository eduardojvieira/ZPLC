export function claimMotorInputCommand(inFlight: { current: boolean }, failure: { current: number | null }): boolean {
  if (inFlight.current || failure.current !== null) return false;
  inFlight.current = true;
  return true;
}

export function shouldClearMotorInputFailure(failedAtMs: number | null, receivedAtMs: number | undefined): boolean {
  return failedAtMs !== null && typeof receivedAtMs === 'number' && receivedAtMs > failedAtMs;
}
