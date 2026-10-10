/** What a compile of the open project produced, as the store records it so that Tests and Simulate can link to it. */
export interface WorkspaceTestArtifact {
  kind: 'zplc' | 'trace';
  sha256: string;
  byteLength: number;
}

export interface CanonicalWorkspaceBuildEvidence {
  projectSession: number;
  compilerRunId: number;
  workspaceId: string;
  zplc: WorkspaceTestArtifact;
}
