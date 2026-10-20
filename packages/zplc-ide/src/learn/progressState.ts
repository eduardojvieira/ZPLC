/**
 * The Learn progress the renderer shows (LRN-002, LRN-010, LRN-031, LRN-032): one store that the Learn home and the lesson
 * surface both read, so a lesson passed in one is passed in the other. On the desktop the document lives in the main process
 * and every change goes through the typed operations of the preload (`progressClient.ts` validates each answer); in a browser,
 * where there is no such store, the passed lessons stay in the local record of the first release and the rest lives in memory.
 *
 * A change shows at once and is confirmed by the answer of the store; a store that does not answer leaves the change on
 * screen and sets `failed`, so the learner is told instead of losing the hint they just opened.
 */
import { create } from 'zustand';
import {
  emptyProgress, exportProgress as exportDocument, mergeProgress, parseImport, withNote, withPassedIds,
  type GradeRecord, type LearnProgress, type LessonNote,
} from '../../shared/learnProgressModel';
import { diagnoseProgressFile, type ProgressFileProblem } from './progressFile';
import { exportProgress, importProgress, noteLesson, readProgress, recordGrade, type ProgressBridge } from './progressClient';
import { readLearnMastery, recordLearnMastery } from '../components/learnLesson';

export type TransferStatus = 'idle' | 'exported' | 'imported' | { error: ProgressFileProblem | 'failed'; version: number | null };

/** Where the passed lessons are kept when there is no desktop store. */
export interface LocalMastery { read(): ReadonlySet<string>; remember(id: string): void }

export interface ProgressState {
  /** The document, or null until the first read ends. */
  document: LearnProgress | null;
  loaded: boolean;
  /** The store could not be read or did not answer a change. */
  failed: boolean;
  transfer: TransferStatus;
  load(): Promise<void>;
  note(entry: LessonNote): Promise<void>;
  recordGrade(record: GradeRecord): Promise<boolean>;
  /** Passes a lesson without a grade record: the run of a recorded scenario where the host has no lesson check. */
  markPassed(id: string): Promise<boolean>;
  /** The text of the export file, or undefined when it could not be made. */
  exportText(): Promise<string | undefined>;
  /** Validates and merges a file the learner chose. False, with the reason in `transfer`, when it is refused. */
  importText(text: string): Promise<boolean>;
  setTransfer(status: TransferStatus): void;
}

const NO_LOCAL: LocalMastery = { read: () => new Set(), remember: () => undefined };

export function createProgressState(getBridge: () => ProgressBridge | undefined, local: LocalMastery = NO_LOCAL) {
  return create<ProgressState>()((set, get) => ({
    document: null,
    loaded: false,
    failed: false,
    transfer: 'idle',

    async load() {
      const bridge = getBridge();
      if (!bridge) { set({ document: withPassedIds(emptyProgress(), [...local.read()]), loaded: true, failed: false }); return; }
      const document = await readProgress(bridge);
      set({ document: document ?? emptyProgress(), loaded: true, failed: document === undefined });
    },

    async note(entry) {
      set((state) => ({ document: withNote(state.document ?? emptyProgress(), entry, new Date().toISOString()) }));
      const bridge = getBridge();
      if (!bridge) return;
      const saved = await noteLesson(bridge, entry);
      if (saved) set({ document: saved, failed: false });
      else set({ failed: true });
    },

    async recordGrade(record) {
      const bridge = getBridge();
      const saved = bridge ? await recordGrade(bridge, record) : undefined;
      if (!saved) { set({ failed: true }); return false; }
      set({ document: saved, failed: false });
      return true;
    },

    async markPassed(id) {
      const bridge = getBridge();
      if (!bridge) {
        local.remember(id);
        set((state) => ({ document: withPassedIds(state.document ?? emptyProgress(), [id]) }));
        return true;
      }
      try { await bridge.merge([id]); } catch { set({ failed: true }); return false; }
      const document = await readProgress(bridge);
      if (!document) { set({ failed: true }); return false; }
      set({ document, failed: false });
      return true;
    },

    async exportText() {
      const bridge = getBridge();
      const text = bridge ? await exportProgress(bridge) : exportDocument(get().document ?? emptyProgress());
      if (text === undefined) set({ transfer: { error: 'failed', version: null } });
      return text;
    },

    async importText(text) {
      const diagnosis = diagnoseProgressFile(text);
      if (!diagnosis.ok) { set({ transfer: { error: diagnosis.problem, version: diagnosis.version } }); return false; }
      const bridge = getBridge();
      if (bridge) {
        const merged = await importProgress(bridge, text);
        if (!merged) { set({ transfer: { error: 'failed', version: null } }); return false; }
        set({ document: merged.progress, transfer: 'imported', failed: false });
        return true;
      }
      const parsed = parseImport(text);
      if (!parsed.ok) return false;
      const before = get().document ?? emptyProgress();
      const merged = mergeProgress(before, parsed.progress);
      for (const [id, lesson] of Object.entries(merged.lessons)) if (lesson.state === 'passed' && before.lessons[id]?.state !== 'passed') local.remember(id);
      set({ document: merged, transfer: 'imported' });
      return true;
    },

    setTransfer(status) { set({ transfer: status }); },
  }));
}

/** The progress of this window: the typed bridge of the preload when there is one, else the local record of passed lessons. */
export const useLearnProgress = createProgressState(
  () => (typeof window === 'undefined' ? undefined : window.electronAPI?.learnProgress),
  { read: () => readLearnMastery(), remember: (id) => { recordLearnMastery(id as never, { kind: 'passed', assertions: 0 }, readLearnMastery()); } },
);
