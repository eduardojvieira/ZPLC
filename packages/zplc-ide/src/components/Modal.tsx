/**
 * Modal: the dialog most of Studio's prompts use. It is the kit's `Dialog` with the width classes its callers wrote,
 * so every prompt gets the same name (`aria-labelledby` its title), focus handling, Escape and scroll lock, and the one
 * place to change them is `ui/Dialog.tsx` (UX-001).
 */
import type { ReactNode } from 'react';
import { Dialog, type DialogSize } from '../ui';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Tailwind max-width class of the caller; it selects the nearest dialog size. Defaults to max-w-2xl. */
  widthClass?: string;
  /** Whether to show the close button */
  showCloseButton?: boolean;
}

const SIZE_OF: Record<string, DialogSize> = {
  'max-w-xs': 'sm',
  'max-w-sm': 'sm',
  'max-w-md': 'sm',
  'max-w-lg': 'md',
  'max-w-xl': 'md',
  'max-w-2xl': 'lg',
  'max-w-3xl': 'xl',
  'max-w-4xl': 'xl',
};

export function Modal({ isOpen, onClose, title, children, widthClass = 'max-w-2xl', showCloseButton = true }: ModalProps) {
  return (
    <Dialog open={isOpen} onClose={onClose} title={title} size={SIZE_OF[widthClass] ?? 'lg'} closeButton={showCloseButton}>
      {children}
    </Dialog>
  );
}
