/**
 * What the host answers an assistant request, shown to the person (IDE-030): the answer, and when the request was an edit, a
 * change set of up to four files. Nothing in it is trusted: the identity of the program that was sent must match, every file
 * is bounded and normalized (a ladder, FBD or SFC file that does not load, or a manifest with a credential, is a refusal the
 * person reads), and the result is a proposal, never a write.
 */
import { CANDIDATE_CHANGE_CAP, isCandidateChangePath } from '../../ai/candidatePaths';
import { parseProposals, type AiProposal } from '../../ai/proposals';
import { prepareChangeSet, type ProposedChange } from '../../ai/changeSetPrepare';
import { ERROR_CODES, record, text } from '../aiProviderPresentation';

export type AgentResponsePresentation =
  | { kind: 'answer'; answer: string; changes?: ProposedChange[]; proposals?: AiProposal[] }
  | { kind: 'refused'; answer: string; reason: 'invalid-file' | 'sensitive-field'; path: string; violations: string[] }
  | { kind: 'error'; code: string }
  | { kind: 'invalid' };

/** The program a request sent: the host answers with the same identity, and with the baseline it read when the request needs one. */
export interface AgentSentProgram {
  workspaceId: string;
  fileId: string;
  path: string;
  baselineSha256?: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const IDENTITY = ['workspaceId', 'fileId', 'path', 'baselineSha256'] as const;
const CHANGE_CONTENT_MAX = 256 * 1024;

function proposedChanges(value: unknown): ProposedChange[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > CANDIDATE_CHANGE_CAP) return null;
  const changes: ProposedChange[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = record(Object.getOwnPropertyDescriptor(value, String(index))?.value);
    if (!item) return null;
    const { path, kind, content, baselineSha256 } = item;
    const keys = Object.keys(item);
    if (
      !isCandidateChangePath(path) ||
      !text(content, CHANGE_CONTENT_MAX) ||
      !(
        (kind === 'modify' && keys.length === 4 && typeof baselineSha256 === 'string' && SHA256.test(baselineSha256)) ||
        (kind === 'create' && keys.length === 3 && baselineSha256 === undefined)
      ) ||
      !['path', 'kind', 'content'].every((key) => keys.includes(key)) ||
      changes.some((other) => other.path === path)
    )
      return null;
    changes.push({ path, kind, content, ...(kind === 'modify' ? { baselineSha256 } : {}) } as ProposedChange);
  }
  return changes;
}

export function presentAgentResponse(value: unknown, expected?: AgentSentProgram): AgentResponsePresentation {
  const item = record(value);
  if (!item) return { kind: 'invalid' };
  if (item.ok === false && Object.keys(item).length === 2 && typeof item.code === 'string' && ERROR_CODES.has(item.code))
    return { kind: 'error', code: item.code };
  const keys = Object.keys(item);
  const hasIdentity = IDENTITY.some((key) => keys.includes(key));
  const allowed = new Set<string>(['ok', 'answer', ...IDENTITY, 'changes', 'proposals']);
  if (item.ok !== true || !text(item.answer, 16 * 1024) || !keys.every((key) => allowed.has(key))) return { kind: 'invalid' };
  if (hasIdentity) {
    if (
      !expected ||
      !IDENTITY.every((key) => keys.includes(key)) ||
      item.workspaceId !== expected.workspaceId ||
      item.fileId !== expected.fileId ||
      item.path !== expected.path ||
      typeof item.baselineSha256 !== 'string' ||
      !SHA256.test(item.baselineSha256) ||
      (expected.baselineSha256 !== undefined && item.baselineSha256 !== expected.baselineSha256)
    )
      return { kind: 'invalid' };
  }
  // editor actions and display settings: validated again here, a button each, never run by the answer itself
  const proposals = keys.includes('proposals') ? parseProposals(item.proposals) : [];
  if (!proposals) return { kind: 'invalid' };
  const withProposals = proposals.length > 0 ? { proposals } : {};
  if (!keys.includes('changes')) return { kind: 'answer', answer: item.answer, ...withProposals };
  const changes = hasIdentity && expected?.baselineSha256 !== undefined ? proposedChanges(item.changes) : null;
  if (!changes) return { kind: 'invalid' };
  const prepared = prepareChangeSet(changes);
  return prepared.ok
    ? { kind: 'answer', answer: item.answer, changes: prepared.changes, ...withProposals }
    : { kind: 'refused', answer: item.answer, reason: prepared.reason, path: prepared.path, violations: prepared.violations };
}
