/**
 * The keys of the visual editors (LNG-012).
 *
 * One table says which key does what in the ladder, function block and sequential function chart editors. The editors
 * look their keys up here, the command list of each editor is built from it, and the page of the documentation that
 * lists the keys is generated from it (`tools/docs/generate_keyboard_reference.ts`): a key that is in the table is a key
 * that works, and a key that works is in the table.
 *
 * `Ctrl` stands for Ctrl, and for Cmd on macOS.
 */

export type VisualEditor = 'ld' | 'fbd' | 'sfc';
export const VISUAL_EDITORS: readonly VisualEditor[] = ['ld', 'fbd', 'sfc'];

export type KeyGroup = 'cursor' | 'insert' | 'bind' | 'connect' | 'edit' | 'structure' | 'delete' | 'other';
export const KEY_GROUPS: readonly KeyGroup[] = ['cursor', 'insert', 'bind', 'connect', 'edit', 'structure', 'delete', 'other'];

export const KEY_GROUP_TITLE: Record<KeyGroup, { en: string; es: string }> = {
  cursor: { en: 'Moving the cursor', es: 'Mover el cursor' },
  insert: { en: 'Inserting elements', es: 'Insertar elementos' },
  bind: { en: 'Binding variables', es: 'Enlazar variables' },
  connect: { en: 'Connecting', es: 'Conectar' },
  edit: { en: 'Editing', es: 'Editar' },
  structure: { en: 'Structure', es: 'Estructura' },
  delete: { en: 'Deleting', es: 'Borrar' },
  other: { en: 'Clipboard, breakpoints and help', es: 'Portapapeles, puntos de parada y ayuda' },
};

export interface KeyAction {
  editor: VisualEditor;
  /** What the editor runs: the same id is the key of the command of the editor. */
  id: string;
  /** The chords that run it, as `chordOf` writes them. */
  keys: readonly string[];
  group: KeyGroup;
  description: { en: string; es: string };
}

const ld = (id: string, keys: string[], group: KeyGroup, en: string, es: string): KeyAction => ({ editor: 'ld', id, keys, group, description: { en, es } });
const fbd = (id: string, keys: string[], group: KeyGroup, en: string, es: string): KeyAction => ({ editor: 'fbd', id, keys, group, description: { en, es } });
const sfc = (id: string, keys: string[], group: KeyGroup, en: string, es: string): KeyAction => ({ editor: 'sfc', id, keys, group, description: { en, es } });

export const KEYMAP: readonly KeyAction[] = [
  // Ladder: the cursor is a cell of a rung.
  ld('cursorLeft', ['ArrowLeft'], 'cursor', 'Move the cursor one cell to the left', 'Mueve el cursor una celda a la izquierda'),
  ld('cursorRight', ['ArrowRight'], 'cursor', 'Move the cursor one cell to the right', 'Mueve el cursor una celda a la derecha'),
  ld('cursorUp', ['ArrowUp'], 'cursor', 'Move the cursor one row up, into the rung above when it is on the first row', 'Mueve el cursor una fila arriba, al peldaño anterior si está en la primera fila'),
  ld('cursorDown', ['ArrowDown'], 'cursor', 'Move the cursor one row down, into the next rung when it is on the last row', 'Mueve el cursor una fila abajo, al peldaño siguiente si está en la última fila'),
  ld('rowStart', ['Home'], 'cursor', 'Move the cursor to the first cell of the row', 'Mueve el cursor a la primera celda de la fila'),
  ld('rowEnd', ['End'], 'cursor', 'Move the cursor to the last cell of the row', 'Mueve el cursor a la última celda de la fila'),
  ld('previousRung', ['PageUp'], 'cursor', 'Move the cursor to the previous rung', 'Mueve el cursor al peldaño anterior'),
  ld('nextRung', ['PageDown'], 'cursor', 'Move the cursor to the next rung', 'Mueve el cursor al peldaño siguiente'),
  ld('firstRung', ['Ctrl+Home'], 'cursor', 'Move the cursor to the first cell of the first rung', 'Mueve el cursor a la primera celda del primer peldaño'),
  ld('lastRung', ['Ctrl+End'], 'cursor', 'Move the cursor to the last cell of the last rung', 'Mueve el cursor a la última celda del último peldaño'),
  ld('insertContact', ['C'], 'insert', 'Insert a normally open contact at the cursor and ask which variable it reads', 'Inserta un contacto normalmente abierto en el cursor y pregunta qué variable lee'),
  ld('insertContactNC', ['N'], 'insert', 'Insert a normally closed contact at the cursor', 'Inserta un contacto normalmente cerrado en el cursor'),
  ld('insertContactP', ['P'], 'insert', 'Insert a positive transition contact at the cursor', 'Inserta un contacto de flanco positivo en el cursor'),
  ld('insertCoil', ['O'], 'insert', 'Insert a coil at the cursor and ask which variable it writes', 'Inserta una bobina en el cursor y pregunta qué variable escribe'),
  ld('insertCoilSet', ['S'], 'insert', 'Insert a set coil at the cursor', 'Inserta una bobina de activación (set) en el cursor'),
  ld('insertCoilReset', ['R'], 'insert', 'Insert a reset coil at the cursor', 'Inserta una bobina de desactivación (reset) en el cursor'),
  ld('insertBranch', ['B'], 'insert', 'Start a parallel branch at the cursor', 'Inicia una rama paralela en el cursor'),
  ld('openPalette', ['Insert', 'I'], 'insert', 'Open the element palette: type to search, Up and Down to choose, Enter to insert', 'Abre la paleta de elementos: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar'),
  ld('activate', ['Enter'], 'insert', 'On an empty cell open the element palette; on an element select it and show its properties', 'En una celda vacía abre la paleta de elementos; en un elemento lo selecciona y muestra sus propiedades'),
  ld('bindVariable', ['F2'], 'bind', 'Bind the element under the cursor to a variable chosen from the declared symbols', 'Enlaza el elemento bajo el cursor a una variable elegida entre los símbolos declarados'),
  ld('editComment', ['Shift+F2'], 'edit', 'Edit the comment of the rung of the cursor', 'Edita el comentario del peldaño del cursor'),
  ld('moveElementLeft', ['Ctrl+ArrowLeft'], 'structure', 'Move the element under the cursor one cell to the left', 'Mueve el elemento bajo el cursor una celda a la izquierda'),
  ld('moveElementRight', ['Ctrl+ArrowRight'], 'structure', 'Move the element under the cursor one cell to the right', 'Mueve el elemento bajo el cursor una celda a la derecha'),
  ld('moveElementUp', ['Ctrl+ArrowUp'], 'structure', 'Move the element under the cursor one row up', 'Mueve el elemento bajo el cursor una fila arriba'),
  ld('moveElementDown', ['Ctrl+ArrowDown'], 'structure', 'Move the element under the cursor one row down', 'Mueve el elemento bajo el cursor una fila abajo'),
  ld('addRung', ['Ctrl+Enter'], 'structure', 'Add a rung after the rung of the cursor', 'Agrega un peldaño después del peldaño del cursor'),
  ld('addRow', ['Ctrl+Shift+Enter'], 'structure', 'Add an empty row to the rung of the cursor', 'Agrega una fila vacía al peldaño del cursor'),
  ld('moveRungUp', ['Alt+ArrowUp'], 'structure', 'Move the rung of the cursor up', 'Mueve el peldaño del cursor hacia arriba'),
  ld('moveRungDown', ['Alt+ArrowDown'], 'structure', 'Move the rung of the cursor down', 'Mueve el peldaño del cursor hacia abajo'),
  ld('widenBranch', ['Alt+ArrowRight'], 'structure', 'Widen the innermost branch at the cursor by one column', 'Ensancha la rama más interna en el cursor una columna'),
  ld('narrowBranch', ['Alt+ArrowLeft'], 'structure', 'Narrow the innermost branch at the cursor by one column', 'Estrecha la rama más interna en el cursor una columna'),
  ld('removeBranch', ['Shift+B'], 'structure', 'Remove the innermost branch at the cursor', 'Quita la rama más interna en el cursor'),
  ld('deleteElement', ['Delete', 'Backspace'], 'delete', 'Delete the element under the cursor', 'Borra el elemento bajo el cursor'),
  ld('deleteRung', ['Shift+Delete'], 'delete', 'Delete the rung of the cursor', 'Borra el peldaño del cursor'),
  ld('copyRung', ['Ctrl+C'], 'other', 'Copy the selected rung', 'Copia el peldaño seleccionado'),
  ld('pasteRung', ['Ctrl+V'], 'other', 'Paste the copied rung after the selected rung', 'Pega el peldaño copiado después del peldaño seleccionado'),
  ld('toggleBreakpoint', ['F9'], 'other', 'Set or clear the breakpoint of the selected rung', 'Pone o quita el punto de parada del peldaño seleccionado'),
  ld('fitView', ['Ctrl+Alt+0'], 'other', 'Show every rung from its left edge', 'Muestra cada peldaño desde su borde izquierdo'),
  ld('showCommands', ['F1'], 'other', 'List every command of the editor with its keys, searchable', 'Lista todos los comandos del editor con sus teclas, con búsqueda'),
  ld('clearSelection', ['Escape'], 'other', 'Clear the selection and close the properties', 'Quita la selección y cierra las propiedades'),

  // Function block diagram: the cursor is the selected block.
  fbd('focusLeft', ['Alt+ArrowLeft'], 'cursor', 'Select the nearest block to the left of the selected block', 'Selecciona el bloque más cercano a la izquierda del bloque seleccionado'),
  fbd('focusRight', ['Alt+ArrowRight'], 'cursor', 'Select the nearest block to the right', 'Selecciona el bloque más cercano a la derecha'),
  fbd('focusUp', ['Alt+ArrowUp'], 'cursor', 'Select the nearest block above', 'Selecciona el bloque más cercano por encima'),
  fbd('focusDown', ['Alt+ArrowDown'], 'cursor', 'Select the nearest block below', 'Selecciona el bloque más cercano por debajo'),
  fbd('focusFirst', ['Home'], 'cursor', 'Select the first block, the top left one', 'Selecciona el primer bloque, el de arriba a la izquierda'),
  fbd('extendLeft', ['Ctrl+Alt+ArrowLeft'], 'cursor', 'Add the nearest block to the left to the selection', 'Añade a la selección el bloque más cercano a la izquierda'),
  fbd('extendRight', ['Ctrl+Alt+ArrowRight'], 'cursor', 'Add the nearest block to the right to the selection', 'Añade a la selección el bloque más cercano a la derecha'),
  fbd('extendUp', ['Ctrl+Alt+ArrowUp'], 'cursor', 'Add the nearest block above to the selection', 'Añade a la selección el bloque más cercano por encima'),
  fbd('extendDown', ['Ctrl+Alt+ArrowDown'], 'cursor', 'Add the nearest block below to the selection', 'Añade a la selección el bloque más cercano por debajo'),
  fbd('selectAll', ['Ctrl+Alt+A'], 'cursor', 'Select every block, to align or delete them together', 'Selecciona todos los bloques, para alinearlos o borrarlos juntos'),
  fbd('insertVariable', ['V'], 'insert', 'Insert a variable block next to the selected block and ask which variable it holds', 'Inserta un bloque de variable junto al bloque seleccionado y pregunta qué variable representa'),
  fbd('insertConstant', ['K'], 'insert', 'Insert a constant block next to the selected block and ask its value', 'Inserta un bloque de constante junto al bloque seleccionado y pregunta su valor'),
  fbd('openPalette', ['Insert', 'I'], 'insert', 'Open the block palette: type to search, Up and Down to choose, Enter to insert next to the selected block', 'Abre la paleta de bloques: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar junto al bloque seleccionado'),
  fbd('bindVariable', ['F2', 'Enter'], 'bind', 'Bind the selected variable block, or name the selected function block instance, from the declared symbols; set the value of a constant', 'Enlaza el bloque de variable seleccionado, o nombra la instancia del bloque de función seleccionado, entre los símbolos declarados; fija el valor de una constante'),
  fbd('connect', ['C'], 'connect', 'List the wires the selected block can have, and draw the chosen one', 'Lista los cables que el bloque seleccionado puede tener y dibuja el elegido'),
  fbd('disconnect', ['Shift+C'], 'connect', 'List the wires of the selected block, and remove the chosen one', 'Lista los cables del bloque seleccionado y quita el elegido'),
  fbd('editComment', ['Shift+F2'], 'edit', 'Edit the comment of the selected block', 'Edita el comentario del bloque seleccionado'),
  fbd('deleteSelection', ['Delete', 'Backspace'], 'delete', 'Delete the selected blocks and wires', 'Borra los bloques y cables seleccionados'),
  fbd('copySelection', ['Ctrl+C'], 'other', 'Copy the selected blocks and the wires between them', 'Copia los bloques seleccionados y los cables entre ellos'),
  fbd('pasteSelection', ['Ctrl+V'], 'other', 'Paste the copied blocks', 'Pega los bloques copiados'),
  fbd('toggleBreakpoint', ['F9'], 'other', 'Set or clear the breakpoint of the selected blocks', 'Pone o quita el punto de parada de los bloques seleccionados'),
  fbd('alignLeft', ['Alt+Shift+ArrowLeft'], 'structure', 'Align the selected elements to the leftmost one', 'Alinea los elementos seleccionados con el más a la izquierda'),
  fbd('alignRight', ['Alt+Shift+ArrowRight'], 'structure', 'Align the selected elements to the rightmost one', 'Alinea los elementos seleccionados con el más a la derecha'),
  fbd('alignTop', ['Alt+Shift+ArrowUp'], 'structure', 'Align the selected elements to the topmost one', 'Alinea los elementos seleccionados con el más alto'),
  fbd('alignBottom', ['Alt+Shift+ArrowDown'], 'structure', 'Align the selected elements to the lowest one', 'Alinea los elementos seleccionados con el más bajo'),
  fbd('alignCenter', ['Alt+Shift+H'], 'structure', 'Centre the selected elements on one vertical line', 'Centra los elementos seleccionados sobre una misma línea vertical'),
  fbd('alignMiddle', ['Alt+Shift+V'], 'structure', 'Centre the selected elements on one horizontal line', 'Centra los elementos seleccionados sobre una misma línea horizontal'),
  fbd('distributeHorizontally', ['Ctrl+Alt+Shift+H'], 'structure', 'Space three or more selected elements evenly from left to right', 'Reparte tres o más elementos seleccionados con el mismo espacio de izquierda a derecha'),
  fbd('distributeVertically', ['Ctrl+Alt+Shift+V'], 'structure', 'Space three or more selected elements evenly from top to bottom', 'Reparte tres o más elementos seleccionados con el mismo espacio de arriba abajo'),
  fbd('fitView', ['Ctrl+Alt+0'], 'other', 'Fit the whole diagram in the view', 'Ajusta todo el diagrama a la vista'),
  fbd('showCommands', ['F1'], 'other', 'List every command of the editor with its keys, searchable', 'Lista todos los comandos del editor con sus teclas, con búsqueda'),

  // Sequential function chart: the cursor is the selected step or transition.
  sfc('focusLeft', ['Alt+ArrowLeft'], 'cursor', 'Select the nearest step or transition to the left of the selected one', 'Selecciona el paso o la transición más cercano a la izquierda del seleccionado'),
  sfc('focusRight', ['Alt+ArrowRight'], 'cursor', 'Select the nearest step or transition to the right', 'Selecciona el paso o la transición más cercano a la derecha'),
  sfc('focusUp', ['Alt+ArrowUp'], 'cursor', 'Select the nearest step or transition above', 'Selecciona el paso o la transición más cercano por encima'),
  sfc('focusDown', ['Alt+ArrowDown'], 'cursor', 'Select the nearest step or transition below', 'Selecciona el paso o la transición más cercano por debajo'),
  sfc('focusFirst', ['Home'], 'cursor', 'Select the first element, the top left one', 'Selecciona el primer elemento, el de arriba a la izquierda'),
  sfc('extendLeft', ['Ctrl+Alt+ArrowLeft'], 'cursor', 'Add the nearest element to the left to the selection', 'Añade a la selección el elemento más cercano a la izquierda'),
  sfc('extendRight', ['Ctrl+Alt+ArrowRight'], 'cursor', 'Add the nearest element to the right to the selection', 'Añade a la selección el elemento más cercano a la derecha'),
  sfc('extendUp', ['Ctrl+Alt+ArrowUp'], 'cursor', 'Add the nearest element above to the selection', 'Añade a la selección el elemento más cercano por encima'),
  sfc('extendDown', ['Ctrl+Alt+ArrowDown'], 'cursor', 'Add the nearest element below to the selection', 'Añade a la selección el elemento más cercano por debajo'),
  sfc('selectAll', ['Ctrl+Alt+A'], 'cursor', 'Select every element, to align or delete them together', 'Selecciona todos los elementos, para alinearlos o borrarlos juntos'),
  sfc('insertStep', ['S'], 'insert', 'Insert a step below the selected element, wired to it when it is a transition', 'Inserta un paso debajo del elemento seleccionado, conectado a él si es una transición'),
  sfc('insertInitialStep', ['Shift+S'], 'insert', 'Insert the initial step', 'Inserta el paso inicial'),
  sfc('insertTransition', ['T'], 'insert', 'Insert a transition below the selected element, wired to it when it is a step', 'Inserta una transición debajo del elemento seleccionado, conectada a él si es un paso'),
  sfc('openPalette', ['Insert', 'I'], 'insert', 'Open the element palette: type to search, Up and Down to choose, Enter to insert', 'Abre la paleta de elementos: se escribe para buscar, Arriba y Abajo para elegir, Enter para insertar'),
  sfc('bindVariable', ['F2', 'Enter'], 'bind', 'Name the selected step, or set the condition of the selected transition from the declared symbols or by typing an expression', 'Nombra el paso seleccionado, o fija la condición de la transición seleccionada entre los símbolos declarados o escribiendo una expresión'),
  sfc('connect', ['C'], 'connect', 'List the wires the selected element can have, and draw the chosen one', 'Lista los cables que el elemento seleccionado puede tener y dibuja el elegido'),
  sfc('disconnect', ['Shift+C'], 'connect', 'List the wires of the selected element, and remove the chosen one', 'Lista los cables del elemento seleccionado y quita el elegido'),
  sfc('editComment', ['Shift+F2'], 'edit', 'Edit the comment of the selected element', 'Edita el comentario del elemento seleccionado'),
  sfc('deleteSelection', ['Delete', 'Backspace'], 'delete', 'Delete the selected elements and wires', 'Borra los elementos y cables seleccionados'),
  sfc('copySelection', ['Ctrl+C'], 'other', 'Copy the selected steps and transitions', 'Copia los pasos y transiciones seleccionados'),
  sfc('pasteSelection', ['Ctrl+V'], 'other', 'Paste the copied steps and transitions', 'Pega los pasos y transiciones copiados'),
  sfc('toggleBreakpoint', ['F9'], 'other', 'Set or clear the breakpoint of the selected elements', 'Pone o quita el punto de parada de los elementos seleccionados'),
  sfc('alignLeft', ['Alt+Shift+ArrowLeft'], 'structure', 'Align the selected elements to the leftmost one', 'Alinea los elementos seleccionados con el más a la izquierda'),
  sfc('alignRight', ['Alt+Shift+ArrowRight'], 'structure', 'Align the selected elements to the rightmost one', 'Alinea los elementos seleccionados con el más a la derecha'),
  sfc('alignTop', ['Alt+Shift+ArrowUp'], 'structure', 'Align the selected elements to the topmost one', 'Alinea los elementos seleccionados con el más alto'),
  sfc('alignBottom', ['Alt+Shift+ArrowDown'], 'structure', 'Align the selected elements to the lowest one', 'Alinea los elementos seleccionados con el más bajo'),
  sfc('alignCenter', ['Alt+Shift+H'], 'structure', 'Centre the selected elements on one vertical line', 'Centra los elementos seleccionados sobre una misma línea vertical'),
  sfc('alignMiddle', ['Alt+Shift+V'], 'structure', 'Centre the selected elements on one horizontal line', 'Centra los elementos seleccionados sobre una misma línea horizontal'),
  sfc('distributeHorizontally', ['Ctrl+Alt+Shift+H'], 'structure', 'Space three or more selected elements evenly from left to right', 'Reparte tres o más elementos seleccionados con el mismo espacio de izquierda a derecha'),
  sfc('distributeVertically', ['Ctrl+Alt+Shift+V'], 'structure', 'Space three or more selected elements evenly from top to bottom', 'Reparte tres o más elementos seleccionados con el mismo espacio de arriba abajo'),
  sfc('fitView', ['Ctrl+Alt+0'], 'other', 'Fit the whole diagram in the view', 'Ajusta todo el diagrama a la vista'),
  sfc('showCommands', ['F1'], 'other', 'List every command of the editor with its keys, searchable', 'Lista todos los comandos del editor con sus teclas, con búsqueda'),
];

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * The chord of a key event, written as the table writes it: `Ctrl+Alt+Shift+Key`, the key of a letter in capitals. Shift
 * is part of the chord of a letter and of a named key; it is not when it only made the character (`?`).
 */
export function chordOf(event: KeyLike): string {
  let key = event.key === ' ' ? 'Space' : event.key;
  if (key.length === 1) key = key.toUpperCase();
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  const symbol = key.length === 1 && key.toLowerCase() === key.toUpperCase();
  if (event.shiftKey && !symbol) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

/** The key event a chord of the table stands for: the inverse of `chordOf`, to run an action from its keys. */
export function parseChord(chord: string): KeyLike {
  const parts = chord.split('+');
  const key = parts[parts.length - 1] === '' ? '+' : parts[parts.length - 1]!;
  const modifiers = new Set(parts.slice(0, -1));
  const shiftKey = modifiers.has('Shift');
  const named = key.length > 1;
  return {
    key: key === 'Space' ? ' ' : named ? key : shiftKey ? key.toUpperCase() : key.toLowerCase(),
    ctrlKey: modifiers.has('Ctrl'),
    altKey: modifiers.has('Alt'),
    shiftKey,
  };
}

/** The actions of one editor. */
export function actionsOf(editor: VisualEditor): KeyAction[] {
  return KEYMAP.filter((action) => action.editor === editor);
}

/** The id of the action that the chord runs in the editor, if any. */
export function actionFor(editor: VisualEditor, event: KeyLike): string | undefined {
  const chord = chordOf(event);
  return KEYMAP.find((action) => action.editor === editor && action.keys.includes(chord))?.id;
}

/** The keys of an action as the reader sees them, `Ctrl+Enter`; the alternatives are joined by ` or `. */
export function keysText(action: Pick<KeyAction, 'keys'>): string {
  return action.keys.join(' or ');
}

/**
 * Whether the target of a key event is a control that keeps its own keys: a field the user types into, a button that
 * Enter and Space press, a dialog of the editor. The editor does not take those keys.
 */
export function keysBelongToControl(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return Boolean(element?.closest?.('input, textarea, select, button, a[href], [contenteditable="true"], [data-keyboard-picker]'));
}
