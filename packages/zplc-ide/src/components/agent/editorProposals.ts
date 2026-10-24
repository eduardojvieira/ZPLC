/**
 * The proposals of an assistant that are not a change set (IDE-030, S6, S7). Checking one reads the project and runs nothing; running one
 * is the person's click and goes through the path they would take themselves: the navigation of a problem, a registered command, the
 * validated setters of the settings. What may be proposed at all is `src/ai/proposals.ts`, and nothing there is physical.
 */
import { AI_COMMAND_PROPOSALS, type AiProposal } from '../../ai/proposals';
import type { FileTreeNode } from '../../types';
import { findFileInTree, readFileContent } from '../../utils/fileSystem';

export type ProposalState = 'ready' | 'no-project' | 'missing-file' | 'missing-line' | 'missing-element' | 'same';
export interface ProposalCheck {
  proposal: AiProposal;
  state: ProposalState;
  /** For a setting: what it is now. */
  current?: string | number;
}

/** What checking and running a proposal need of the application; the shell passes its store, its commands and its settings. */
export interface ProposalDeps {
  isProjectOpen: boolean;
  fileTree: FileTreeNode | null;
  loadedFiles: Map<string, { content: string }>;
  openFile(fileId: string): Promise<void>;
  /** Opens the file at a position, as a click on a problem does; false when it did not open. */
  navigate(path: string, line: number, column: number): Promise<boolean>;
  selectElement(path: string, element: string): void;
  /** A registered command, only if the application offers it now. */
  runCommand(id: string): 'ran' | 'unavailable' | 'unknown';
  currentSetting(name: 'theme' | 'language' | 'density' | 'editorFontSize' | 'editorTabSize'): string | number;
  applySetting(name: 'theme' | 'language' | 'density' | 'editorFontSize' | 'editorTabSize', value: string | number): void;
}

async function textOf(path: string, deps: ProposalDeps): Promise<string | null> {
  const node = deps.fileTree ? findFileInTree(deps.fileTree, path) : null;
  if (!node || node.type !== 'file') return null;
  const open = deps.loadedFiles.get(`file:${path}`);
  if (open) return open.content;
  try {
    return node.handle ? await readFileContent(node.handle) : null;
  } catch {
    return null;
  }
}

function hasElement(path: string, text: string, element: string): boolean {
  const colon = element.indexOf(':');
  const kind = element.slice(0, colon);
  let id: string;
  try {
    id = decodeURIComponent(element.slice(colon + 1));
  } catch {
    return false;
  }
  try {
    const document = JSON.parse(text) as Record<string, unknown>;
    const list = (key: string): Array<{ id?: unknown }> => (Array.isArray(document[key]) ? (document[key] as Array<{ id?: unknown }>) : []);
    const items = path.endsWith('.ld.json')
      ? list('rungs')
      : path.endsWith('.fbd.json')
        ? list('blocks')
        : kind === 'step'
          ? list('steps')
          : list('transitions');
    return items.some((item) => item?.id === id);
  } catch {
    return false;
  }
}

async function checkOne(proposal: AiProposal, deps: ProposalDeps): Promise<ProposalCheck> {
  if (proposal.type === 'setting') {
    const current = deps.currentSetting(proposal.name);
    return { proposal, state: current === proposal.value ? 'same' : 'ready', current };
  }
  if (!deps.isProjectOpen) return { proposal, state: 'no-project' };
  if (proposal.type === 'openFile' || proposal.type === 'goToLine' || proposal.type === 'selectElement') {
    const text = await textOf(proposal.path, deps);
    if (text === null) return { proposal, state: 'missing-file' };
    if (proposal.type === 'goToLine' && proposal.line > text.split('\n').length) return { proposal, state: 'missing-line' };
    if (proposal.type === 'selectElement' && !hasElement(proposal.path, text, proposal.element))
      return { proposal, state: 'missing-element' };
  }
  return { proposal, state: 'ready' };
}

/** Reads the project for each proposal and says whether it can be offered as a button; nothing is run. */
export function checkProposals(proposals: readonly AiProposal[], deps: ProposalDeps): Promise<ProposalCheck[]> {
  return Promise.all(proposals.map((proposal) => checkOne(proposal, deps)));
}

/** The person's click: runs one proposal through the path a person would use; 'unavailable' when the application does not offer it now. */
export async function runProposal(proposal: AiProposal, deps: ProposalDeps): Promise<'ran' | 'unavailable'> {
  switch (proposal.type) {
    case 'openFile':
      await deps.openFile(`file:${proposal.path}`);
      return 'ran';
    case 'goToLine':
      return (await deps.navigate(proposal.path, proposal.line, 1)) ? 'ran' : 'unavailable';
    case 'selectElement':
      if (!(await deps.navigate(proposal.path, 1, 1))) return 'unavailable';
      deps.selectElement(proposal.path, proposal.element);
      return 'ran';
    case 'setting':
      deps.applySetting(proposal.name, proposal.value);
      return deps.currentSetting(proposal.name) === proposal.value ? 'ran' : 'unavailable';
    default:
      return deps.runCommand(AI_COMMAND_PROPOSALS[proposal.type]) === 'ran' ? 'ran' : 'unavailable';
  }
}
