/**
 * The modal dialogs that are open, in order, and the scroll lock they share. Only the topmost handles Escape and Tab,
 * and closing one of two nested dialogs does not release the scroll under the other.
 */
const stack: symbol[] = [];
let original = '';

export interface ModalHandle {
  isTop: () => boolean;
  release: () => void;
}

export function registerModal(): ModalHandle {
  const token = Symbol('modal');
  if (typeof document === 'undefined') return { isTop: () => true, release: () => undefined };
  if (stack.length === 0) { original = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
  stack.push(token);
  return {
    isTop: () => stack[stack.length - 1] === token,
    release: () => {
      const index = stack.indexOf(token);
      if (index < 0) return;
      stack.splice(index, 1);
      if (stack.length === 0) document.body.style.overflow = original;
    },
  };
}
