export const NATIVE_SIMULATION_CHANNEL = {
  START_SESSION: 'native-simulation:start-session',
  STOP_SESSION: 'native-simulation:stop-session',
  REQUEST: 'native-simulation:request',
  EVENT: 'native-simulation:event',
} as const;

export interface NativeSimulationHelloResult {
  protocol_version: string;
  runtime_kind: string;
  runtime_version: string;
  capability_profile: {
    profile_id: string;
    features: Array<{
      name: string;
      status: 'supported' | 'degraded' | 'unavailable';
      reason?: string;
      recommended_action?: string;
    }>;
  };
}

export interface NativeSimulationRequest {
  id: string;
  type: 'request';
  method: string;
  params: Record<string, unknown>;
}

export interface NativeSimulationEvent {
  type: 'event';
  method: string;
  params: Record<string, unknown>;
}

export interface NativeSimulationParityEvidence {
  evidence_id: string;
  reference_project_id: string;
  capability_scope: string[];
  native_result: 'pass' | 'fail' | 'degraded';
  hardware_result: 'pass' | 'fail';
  mismatches: Array<{
    feature: string;
    native_observation: string;
    hardware_observation: string;
    severity: 'blocking' | 'degrading' | 'informational';
    resolution: 'fix' | 'downgrade-claim' | 'accepted-difference';
  }>;
  owner: string;
  recorded_at: string;
}
