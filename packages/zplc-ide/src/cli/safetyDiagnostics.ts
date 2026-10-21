/**
 * The diagnostics of the safety check that are about the source rather than about the declared outputs: the code, the
 * fixed message and the position of each, and the walk that finds the loops with no static bound (the Tool API's
 * `safetyCheck` in toolApi.ts collects them with the rest).
 */
import type { Statement } from '../compiler';
import type { ToolDiagnostic } from './workspace';

export type SafetyDiagnosticCode =
  | 'SAFETY_OUTPUT_INVALID'
  | 'SAFETY_OUTPUT_DUPLICATE'
  | 'SAFETY_INTERLOCK_UNCOVERED'
  | 'SAFETY_SCENARIO_INVALID'
  | 'SAFETY_SCENARIOS_UNAVAILABLE'
  | 'SAFETY_UNBOUNDED_WHILE'
  | 'SAFETY_UNBOUNDED_REPEAT';
export function safetyDiagnostic(code: SafetyDiagnosticCode, path?: string, line?: number, element?: string): ToolDiagnostic {
  const message =
    code === 'SAFETY_INTERLOCK_UNCOVERED'
      ? 'Declared incompatible outputs lack exact NEVER coverage'
      : code === 'SAFETY_SCENARIO_INVALID'
        ? 'Scenario cannot be used for safety coverage'
        : code === 'SAFETY_SCENARIOS_UNAVAILABLE'
          ? 'Scenarios are unavailable for safety coverage'
          : code === 'SAFETY_UNBOUNDED_WHILE'
            ? 'WHILE has no provable static iteration bound'
            : code === 'SAFETY_UNBOUNDED_REPEAT'
              ? 'REPEAT has no provable static iteration bound'
              : 'Declared safety output is invalid';
  return {
    code,
    message,
    ...(path ? { path } : {}),
    ...(line === undefined ? {} : { line }),
    ...(element === undefined ? {} : { element }),
  };
}
/**
 * `elementOf` gives, for a line of the generated Structured Text of a diagram, the element it was written for: the loop of
 * an SFC action is reported against the action (LNG-026), and has no line of its own.
 */
export function collectUnboundedLoopDiagnostics(
  statements: Statement[],
  path: string,
  includeLine: boolean,
  diagnostics: ToolDiagnostic[],
  elementOf?: (line: number) => string | undefined,
): void {
  const visit = (inner: Statement[]) => collectUnboundedLoopDiagnostics(inner, path, includeLine, diagnostics, elementOf);
  for (const statement of statements) {
    switch (statement.kind) {
      case 'WhileStatement':
        diagnostics.push(
          safetyDiagnostic('SAFETY_UNBOUNDED_WHILE', path, includeLine ? statement.line : undefined, elementOf?.(statement.line)),
        );
        visit(statement.body);
        break;
      case 'RepeatStatement':
        diagnostics.push(
          safetyDiagnostic('SAFETY_UNBOUNDED_REPEAT', path, includeLine ? statement.line : undefined, elementOf?.(statement.line)),
        );
        visit(statement.body);
        break;
      case 'IfStatement':
        visit(statement.thenBranch);
        for (const branch of statement.elsifBranches) visit(branch.statements);
        if (statement.elseBranch) visit(statement.elseBranch);
        break;
      case 'ForStatement':
        visit(statement.body);
        break;
      case 'CaseStatement':
        for (const branch of statement.branches) visit(branch.statements);
        if (statement.elseBranch) visit(statement.elseBranch);
        break;
    }
  }
}
