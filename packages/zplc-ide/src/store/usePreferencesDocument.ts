/**
 * The Preferences document (spec 013 SHL-011): whether it is open, whether it is the active view of the editor area (or, with no
 * project open, of the Welcome screen), and the setting it was asked to show. The fields are the user's and live in
 * `useAppSettings`; this store only says where they are edited.
 */
import { create } from 'zustand';

/** The id of the Preferences document among the views of the editor area. */
export const PREFERENCES_VIEW_ID = 'preferences';

/** The section of the document that holds the MCP connection panel (`ai.connectMcp`). */
export const MCP_SECTION_ID = 'mcp-connection';

/** A setting key of the palette's preference entries, or the section that holds the assistant provider form. */
export type PreferenceAnchor = string;

interface PreferencesDocumentState {
  open: boolean;
  active: boolean;
  /** Counts the requests to show it, so that asking again for another setting scrolls again. */
  requests: number;
  anchor: PreferenceAnchor | null;
  show: (anchor?: PreferenceAnchor | null) => void;
  deselect: () => void;
  select: () => void;
  close: () => void;
}

export const usePreferencesDocument = create<PreferencesDocumentState>((set) => ({
  open: false,
  active: false,
  requests: 0,
  anchor: null,
  show: (anchor = null) => set((state) => ({ open: true, active: true, anchor, requests: state.requests + 1 })),
  deselect: () => set((state) => (state.active ? { active: false } : state)),
  select: () => set((state) => (state.open && !state.active ? { active: true } : state)),
  close: () => set((state) => (state.open ? { open: false, active: false, anchor: null } : state)),
}));
