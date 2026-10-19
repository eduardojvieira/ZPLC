import { create } from 'zustand';

/** Whether the New project dialog (IDE-009) is open. The Welcome screen and the File command both open it. */
export const useNewProjectDialog = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
