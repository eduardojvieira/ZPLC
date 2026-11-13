/** The contract of the project tests (plan-u2.md, C-T): types only. Tasks T1 to T4 implement against it. */
import type { WorkspaceTestPresentation } from '../components/workspaceTestPresentation';

/** TST-001; 'older' is TST-005. */
export type TestStatus = 'notRun' | 'passed' | 'failed' | 'older';
export interface ProjectTest {
  path: string;
  id: string;
  expectations: Array<{ index: number; kind: string; atMs?: number }>;
  valid: boolean;
}
export interface TestRecord {
  path: string;
  status: TestStatus;
  presentation?: WorkspaceTestPresentation;
  compilerRunId: number;
  projectSession: number;
  at: number;
}
/** Filled from the failure details of task T1. */
export interface TestFailure {
  path: string;
  index: number;
  kind: string;
  atMs?: number;
  checks: Array<{ signal: string; expected: boolean; observed?: boolean }>;
}
