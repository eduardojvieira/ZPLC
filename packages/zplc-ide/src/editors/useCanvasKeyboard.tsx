/**
 * The keyboard editing of a canvas of nodes (LNG-012), shared by the function block and the sequential function chart
 * editors: the keys of the table run the commands of the editor on the nodes and wires it holds, and what a command asks
 * (the element to insert, the name to bind, the wire to draw) is asked with the search list.
 */

import { useCallback, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type RefObject } from 'react';
import type { Edge, Node } from '@xyflow/react';
import { actionFor, actionsOf, keysBelongToControl, keysText, type VisualEditor } from './keymap';
import { freeTextOf, type PickerItem } from './picker';
import SearchList from './SearchList';

type PromptKind = 'palette' | 'bind' | 'connect' | 'disconnect' | 'comment';

/** What a command of either editor gives back (see `fbd/keyboard.ts` and `sfc/keyboard.ts`). */
export interface CanvasOutcome {
  nodes: Node[];
  edges: Edge[];
  changed: boolean;
  say: string;
  refused?: boolean;
  prompt?: { kind: PromptKind };
  choices?: PickerItem[];
  title?: string;
  allowFreeText?: boolean;
}

/** How one editor answers the questions its commands ask, and what it asks. */
export interface CanvasCommands<Argument> {
  editor: Extract<VisualEditor, 'fbd' | 'sfc'>;
  run: (nodes: Node[], edges: Edge[], command: string, argument?: Argument) => CanvasOutcome;
  /** The elements the palette offers. */
  palette: () => PickerItem[];
  paletteTitle: string;
  palettePlaceholder: string;
  /** The commands that do not change the document, which a diagram that is not edited still takes. */
  readOnlyCommands: ReadonlySet<string>;
  /** The argument of the command that an answer to a question runs. */
  answer: {
    palette: (id: string) => Argument;
    bind: (name: string) => Argument;
    connect: (wire: string) => Argument;
    disconnect: (edgeId: string) => Argument;
    comment: (text: string) => Argument;
  };
  /** What the commands that need the editor itself are: the clipboard and the breakpoints. */
  editorCommands: ReadonlySet<string>;
}

interface Ask {
  kind: PromptKind | 'commands';
  title: string;
  items: PickerItem[];
  allowFreeText: boolean;
  placeholder?: string;
}

export interface CanvasKeyboardOptions<Argument> {
  commands: CanvasCommands<Argument>;
  nodesRef: RefObject<Node[]>;
  edgesRef: RefObject<Edge[]>;
  readOnly: boolean;
  /** The canvas wrapper, to move the focus to the selected element. */
  wrapperRef: RefObject<HTMLDivElement | null>;
  /** The nodes and wires of a command that changed the document: committed as one gesture. */
  commit: (nodes: Node[], edges: Edge[]) => void;
  /** The nodes and wires of a command that only moved the cursor: shown, not committed. */
  show: (nodes: Node[], edges: Edge[]) => void;
  /** Gives a node made by a command what the canvas puts on each node (its callbacks). */
  decorate: (node: Node) => Node;
  /** The commands that need what only the editor holds. */
  editorCommand: (command: string) => void;
  /** Whether a node holds a comment, to offer clearing it. */
  commentOf: (node: Node) => string | undefined;
}

export function useCanvasKeyboard<Argument>(options: CanvasKeyboardOptions<Argument>): {
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  run: (command: string, argument?: Argument) => void;
  overlay: ReactElement | null;
  status: ReactElement;
} {
  const { commands, nodesRef, edgesRef, readOnly, wrapperRef, commit, show, decorate, editorCommand, commentOf } = options;
  const [ask, setAsk] = useState<Ask | null>(null);
  const [status, setStatus] = useState('');

  const apply = useCallback((outcome: CanvasOutcome) => {
    const nodes = outcome.nodes.map(decorate);
    if (outcome.changed) commit(nodes, outcome.edges);
    else show(nodes, outcome.edges);
    setStatus(outcome.say);
    const prompt = outcome.prompt;
    // a node that is replaced while the canvas is rebuilt takes the focus with it: the canvas itself holds it meanwhile
    if (outcome.changed && !prompt && !wrapperRef.current?.contains(document.activeElement)) wrapperRef.current?.focus();
    if (prompt?.kind === 'palette') {
      setAsk({ kind: 'palette', title: commands.paletteTitle, items: commands.palette(), allowFreeText: false, placeholder: commands.palettePlaceholder });
    } else if (prompt?.kind === 'comment') {
      const selected = nodes.find((node) => node.selected);
      const has = selected !== undefined && commentOf(selected) !== undefined;
      setAsk({ kind: 'comment', title: 'Comment', items: has ? [{ id: '__clear', label: 'Clear the comment' }] : [], allowFreeText: true, placeholder: 'Type the comment' });
    } else if (prompt) {
      setAsk({ kind: prompt.kind, title: outcome.title ?? 'Choose', items: outcome.choices ?? [], allowFreeText: outcome.allowFreeText === true });
    }
    // the focus goes to the element of the cursor, so that a screen reader says it, and the canvas pans to it
    const selected = nodes.filter((node) => node.selected);
    if (selected.length === 1 && !prompt) {
      const id = selected[0]!.id;
      // The list that was just answered is still being removed in the first frame, and the canvas draws a new node hidden
      // until it has measured it: a node that is hidden cannot take the focus, so the focus is asked for until it holds.
      const focus = (attempt: number) => requestAnimationFrame(() => {
        if (document.querySelector('[data-keyboard-picker]')) {
          if (attempt < 30) focus(attempt + 1);
          return;
        }
        const wrapper = wrapperRef.current;
        const target = [...(wrapper?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [])].find((element) => element.getAttribute('data-id') === id);
        target?.focus();
        if (document.activeElement === target) return;
        // until the node can take it, the canvas holds the focus, so that the next key is still a key of the editor
        if (!wrapper?.contains(document.activeElement)) wrapper?.focus();
        if (target && attempt < 30) focus(attempt + 1);
      });
      focus(0);
    }
  }, [commands, commentOf, commit, decorate, show, wrapperRef]);

  const run = useCallback((command: string, argument?: Argument) => {
    if (commands.editorCommands.has(command)) {
      editorCommand(command);
      return;
    }
    if (command === 'showCommands') {
      setAsk({
        kind: 'commands',
        title: `Commands of the ${commands.editor === 'fbd' ? 'function block' : 'sequential function chart'} editor`,
        items: actionsOf(commands.editor).map((action) => ({ id: action.id, label: action.description.en, detail: keysText(action) })),
        allowFreeText: false,
        placeholder: 'Type to search the commands',
      });
      return;
    }
    apply(commands.run(nodesRef.current ?? [], edgesRef.current ?? [], command, argument));
  }, [apply, commands, edgesRef, editorCommand, nodesRef]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (keysBelongToControl(event.target)) return;
    const command = actionFor(commands.editor, event);
    if (!command) return;
    if (readOnly && !commands.readOnlyCommands.has(command)) return;
    if (command === 'toggleBreakpoint' && !(nodesRef.current ?? []).some((node) => node.selected)) return;
    event.preventDefault();
    run(command);
  }, [commands, nodesRef, readOnly, run]);

  const overlay = useMemo(() => {
    if (!ask || (readOnly && ask.kind !== 'commands')) return null;
    const choose = (item: PickerItem) => {
      setAsk(null);
      const typed = freeTextOf(item);
      switch (ask.kind) {
        case 'palette': run('insertElement', commands.answer.palette(item.id)); break;
        case 'bind': run('bindVariable', commands.answer.bind(typed ?? item.id)); break;
        case 'connect': run('connect', commands.answer.connect(item.id)); break;
        case 'disconnect': run('disconnect', commands.answer.disconnect(item.id)); break;
        case 'comment': run('editComment', commands.answer.comment(item.id === '__clear' ? '' : typed ?? item.label)); break;
        case 'commands': run(item.id); break;
      }
    };
    return (
      <SearchList
        title={ask.title}
        items={ask.items}
        allowFreeText={ask.allowFreeText}
        freeTextLabel={ask.kind === 'comment' ? (text) => `Set the comment to "${text}"` : ask.kind === 'bind' ? (text) => `Use ${text}` : undefined}
        placeholder={ask.placeholder ?? (ask.kind === 'bind' ? 'Type to search the declared symbols, or type a name' : 'Type to search')}
        emptyText={ask.kind === 'connect' ? 'No wire can be drawn.' : undefined}
        onChoose={choose}
        onCancel={() => setAsk(null)}
      />
    );
  }, [ask, commands, readOnly, run]);

  const statusRegion = <div role="status" aria-live="polite" data-visual-status className="sr-only">{status}</div>;
  return { onKeyDown, run, overlay, status: statusRegion };
}
