import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const electronDir = path.dirname(fileURLToPath(import.meta.url));
const mainSource = readFileSync(path.join(electronDir, 'main.ts'), 'utf8');
const preloadSource = readFileSync(path.join(electronDir, 'preload.ts'), 'utf8');

describe('workspace test IPC boundary', () => {
  it('keeps the two IPC channels aligned and narrow', () => {
    for (const channel of ['workspace-tests:register-project-file', 'workspace-tests:run', 'workspace-tests:cancel', 'workspace-tests:compile', 'workspace-tests:safety-check', 'candidate-change-set:review']) {
      expect(mainSource).toContain(channel);
      expect(preloadSource).toContain(channel);
    }

    expect(preloadSource).toContain('workspaceTests: {');
    expect(preloadSource).toContain('registerProjectFile: (file: File) =>');
    expect(preloadSource).toContain('run: (request: { workspaceId: string; scenarioId?: string }) =>');
    expect(preloadSource).toContain('compile: (request: { workspaceId: string }) =>');
    expect(preloadSource).toContain('safetyCheck: (request: { workspaceId: string }) =>');
    expect(preloadSource).toContain('candidateChangeSet: {');
    expect(preloadSource).toContain('review: (request: { workspaceId: string; edit: { path: string; content: string } }) =>');
    expect(preloadSource).not.toContain('ipcRenderer.send');
    expect(preloadSource).not.toContain('ipcRenderer.on(WORKSPACE_TESTS_CHANNEL');
  });

  it('checks only saved linked workspace interlocks through the owner-bound gateway', () => {
    expect(mainSource).toContain("SAFETY_CHECK: 'workspace-tests:safety-check'");
    expect(mainSource).toContain('ipcMain.handle(WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK, async (event, ...args: unknown[]) => {');
    expect(mainSource).toContain('isAllowedWorkspaceTestRequest(request)');
    expect(mainSource).toContain('workspaceTestGateway.run(owner.ownerId, request, async (root, options) => {');
    expect(mainSource).toContain("safetyCheck?: (workspaceRoot: string) => Promise<unknown>");
    expect(mainSource).toContain('const value = await toolApi.safetyCheck(root);');
    expect(mainSource).toContain("finishStudioExecution(toolApi, options, 'safety:check', 'safety-check', value)");
    expect(mainSource).toContain('sanitizeWorkspaceSafetyCheck(result)');
    expect(mainSource).toContain("typeof toolApi.safetyCheck !== 'function'");
    expect(preloadSource).toContain('WORKSPACE_TESTS_CHANNEL.SAFETY_CHECK');
  });

  it('reviews one validated ST candidate through the opaque workspace gateway without an apply surface', () => {
    expect(mainSource).toContain("REVIEW: 'candidate-change-set:review'");
    expect(mainSource).toContain('ipcMain.handle(CANDIDATE_CHANGE_SET_CHANNEL.REVIEW, async (event, ...args: unknown[]) => {');
    expect(mainSource).toContain('isAllowedCandidateChangeSetReviewRequest(request)');
    expect(mainSource).toContain('workspaceTestGateway.run(owner.ownerId, { workspaceId: request.workspaceId }, async (root, options) => {');
    expect(mainSource).toContain('createCandidateChangeSet?: (workspaceRoot: string, edits: unknown, options: { signal: AbortSignal }) => Promise<unknown>');
    expect(mainSource).toContain('toolApi.createCandidateChangeSet(root, [{ path: request.edit.path, content: request.edit.content }], options)');
    expect(mainSource).toContain('sanitizeCandidateChangeSetReview(result, request.edit.path)');
    expect(mainSource).toContain('if (!rendererOwnerIsCurrent(owner)) throw new Error(\'Request denied\');');
    expect(preloadSource).not.toContain("from './security.js'");
    expect(preloadSource).not.toContain('isAllowedCandidateChangeSetReviewRequest(request)');
    expect(preloadSource).toContain('CANDIDATE_CHANGE_SET_CHANNEL.REVIEW');
    for (const forbidden of ['candidate-change-set:apply', 'candidate-change-set:save', 'candidate-change-set:write', 'candidate-change-set:flash', 'candidate-change-set:deploy', 'candidate-change-set:force']) {
      expect(mainSource).not.toContain(forbidden);
      expect(preloadSource).not.toContain(forbidden);
    }
  });

  it('registers a manifest path only after preload derives it from a real File', () => {
    expect(preloadSource).toContain('webUtils.getPathForFile(file)');
    expect(preloadSource).toContain('WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_FILE');
    expect(mainSource).toContain("ipcMain.handle(WORKSPACE_TESTS_CHANNEL.REGISTER_PROJECT_FILE, async (event, ...args: unknown[]) => {");
    expect(mainSource).toContain('workspaceTestGateway.registerProjectManifest(owner.ownerId, manifestPath)');
    expect(preloadSource).not.toContain('getPathForFile(file) as');
  });

  it('has no directory-picker registration path', () => {
    expect(mainSource).not.toContain('workspace-tests:select');
    expect(preloadSource).not.toContain('selectWorkspace');
    expect(mainSource).not.toContain('WORKSPACE_TESTS_CHANNEL.SELECT');
  });

  it('runs only the validated opaque requests through Tool API and revokes document owners', () => {
    expect(mainSource).toContain("ipcMain.handle(WORKSPACE_TESTS_CHANNEL.RUN, async (event, ...args: unknown[]) => {");
    expect(mainSource).toContain('if (args.length !== 1) {');
    expect(mainSource).toContain('const request = args[0];');
    expect(mainSource).toContain('isAllowedWorkspaceTestRunRequest(request)');
    expect(mainSource).toContain('const workspaceRequest = { workspaceId: request.workspaceId };');
    expect(mainSource).toContain('workspaceTestGateway.run(owner.ownerId, workspaceRequest, async (root, options) => {');
    expect(mainSource).toContain("pathToFileURL(path.join(__dirname, 'toolApi.js')).href");
    expect(mainSource).toContain("typeof toolApi.testsRun !== 'function'");
    expect(mainSource).toContain('const value = await toolApi.testsRun(root, options);');
    expect(mainSource).toContain("finishStudioExecution(toolApi, options, 'tests:run', 'test', value)");
    expect(mainSource).toContain("typeof toolApi.scenarioRun !== 'function'");
    expect(mainSource).toContain('const value = await toolApi.scenarioRun(root, scenarioId, options);');
    expect(mainSource).toContain("finishStudioExecution(toolApi, options, 'tests:run', 'scenario-run', value)");
    expect(mainSource).toContain("ipcMain.handle(WORKSPACE_TESTS_CHANNEL.CANCEL, async (event, ...args: unknown[]) => {");
    expect(mainSource).toContain('if (args.length !== 0 || !owner) throw new Error(\'Request denied\');');
    expect(mainSource).toContain('workspaceTestGateway.cancel(owner.ownerId)');
    expect(preloadSource).toContain('cancel: () => ipcRenderer.invoke(WORKSPACE_TESTS_CHANNEL.CANCEL)');
    expect(mainSource).toContain("ipcMain.handle(WORKSPACE_TESTS_CHANNEL.COMPILE, async (event, ...args: unknown[]) => {");
    expect(mainSource).toContain('const value = await toolApi.compilerCompile(root);');
    expect(mainSource).toContain("toWorkspaceCompileEnvelope(value, await finishStudioExecution(toolApi, options, 'compiler:check', 'compile', value))");
    expect(mainSource).toContain('toWorkspaceCompileEnvelope');
    expect(mainSource).toContain("createHash('sha256').update(result.zplcFile).digest('hex')");
    expect(mainSource).toContain('zplcEvidence: {');
    expect(mainSource).toContain('byteLength: result.zplcFile.byteLength');
    expect(mainSource).toContain('workspaceTestGateway.revokeOwner(ownerId);');
    expect(mainSource).toContain('function revokeRendererOwner(ownerId: number): void {');
    expect(mainSource).toContain("webContents.on('did-start-navigation', (details) => {");
    expect(mainSource).toContain('if (details.isMainFrame && !details.isSameDocument) {');
  });

  it('records candidate review metadata as an agent test without returning prompt or source data through the audit path', () => {
    expect(mainSource).toContain("actor: 'agent',");
    expect(mainSource).toContain("permission: 'tests:run',");
    expect(mainSource).toContain("operation: 'change-set-review',");
    expect(mainSource).toContain('await finishAgentReviewExecution(toolApi, options, value);');
    expect(mainSource).toContain("await finishAgentReviewExecution(toolApi, options, { evidence: { outcome: 'failed' } });");
    expect(mainSource).toContain("await toolExecutionAudit.open(app.getPath('userData'), toolApi.isToolExecutionEnvelope);");
    expect(mainSource).not.toContain('tool-execution-audit:write');
    expect(mainSource).not.toContain('tool-execution-audit:delete');
    expect(mainSource).not.toContain('tool-execution-audit:export');
  });

  it('projects gateway execution identity without leaking run options into the audit envelope', () => {
    const studioHelper = mainSource.slice(
      mainSource.indexOf('async function finishStudioExecution('),
      mainSource.indexOf('async function finishAgentReviewExecution('),
    );
    const agentHelper = mainSource.slice(
      mainSource.indexOf('async function finishAgentReviewExecution('),
      mainSource.indexOf('// Packaging is the trust boundary'),
    );

    for (const helper of [studioHelper, agentHelper]) {
      expect(helper).toContain('jobId: start.jobId');
      expect(helper).toContain('startedAt: start.startedAt');
      expect(helper).not.toContain('...start');
      expect(helper).not.toContain('signal');
    }
    expect(studioHelper).toContain("actor: 'human-studio',");
    expect(studioHelper).toContain('permission,');
    expect(studioHelper).toContain('operation,');
    expect(agentHelper).toContain("actor: 'agent',");
    expect(agentHelper).toContain("permission: 'tests:run',");
    expect(agentHelper).toContain("operation: 'change-set-review',");
  });

  it('does not add physical or generic-host operations to the workspace boundary', () => {
    for (const forbidden of ['flash', 'deploy', 'raw serial', 'shell', 'force', 'stop']) {
      expect(mainSource.toLowerCase()).not.toContain(`workspace-tests:${forbidden.toLowerCase()}`);
      expect(preloadSource.toLowerCase()).not.toContain(`workspace-tests:${forbidden.toLowerCase()}`);
    }
  });
});
