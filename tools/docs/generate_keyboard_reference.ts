// The keyboard reference of the visual editors, generated from the table the editors read their keys from (LNG-012).
//
//   bun tools/docs/generate_keyboard_reference.ts           write docs/docs/reference/visual-editor-keyboard.md and the Spanish twin
//   bun tools/docs/generate_keyboard_reference.ts --check   exit 1 when a page is stale
//
// The source is packages/zplc-ide/src/editors/keymap.ts: the table that the ladder, function block and sequential function
// chart editors look their keys up in. A key that works is in the table, and a key that is in the table works, because
// each editor runs the command of the table's id (a test fails when a table row has no command and the other way round).
// Nothing on the page is written by hand but the introduction and the headings.
import {
  KEY_GROUP_TITLE,
  KEY_GROUPS,
  VISUAL_EDITORS,
  actionsOf,
  type KeyAction,
  type VisualEditor,
} from '../../packages/zplc-ide/src/editors/keymap.ts';
import { code, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_keyboard_reference.ts';

const EDITOR_TITLE: Record<VisualEditor, L10n> = {
  ld: { en: 'Ladder Diagram editor', es: 'Editor de diagrama de escalera' },
  fbd: { en: 'Function Block Diagram editor', es: 'Editor de diagrama de bloques de función' },
  sfc: { en: 'Sequential Function Chart editor', es: 'Editor de diagrama funcional secuencial' },
};

const EDITOR_CURSOR: Record<VisualEditor, L10n> = {
  ld: {
    en:
      'The cursor is a cell of a rung, drawn as a blue frame. Clicking a cell puts it there. Insert, bind and delete act on the cell ' +
      'under it.',
    es:
      'El cursor es una celda de un peldaño, dibujada como un marco azul. Hacer clic en una celda lo pone allí. Insertar, enlazar y ' +
      'borrar actúan sobre la celda que tiene debajo.',
  },
  fbd: {
    en:
      'The cursor is the selected block. The arrow keys without a modifier nudge the selected block on the canvas, as the canvas does; ' +
      'Tab moves between the blocks in the order of the file.',
    es:
      'El cursor es el bloque seleccionado. Las flechas sin modificador desplazan el bloque seleccionado en el lienzo, como hace el ' +
      'lienzo; Tab pasa de un bloque a otro en el orden del archivo.',
  },
  sfc: {
    en:
      'The cursor is the selected step or transition. The arrow keys without a modifier nudge the selected element on the canvas, as ' +
      'the canvas does; Tab moves between the elements in the order of the file.',
    es:
      'El cursor es el paso o la transición seleccionados. Las flechas sin modificador desplazan el elemento seleccionado en el ' +
      'lienzo, como hace el lienzo; Tab pasa de un elemento a otro en el orden del archivo.',
  },
};

const INTRO: L10n = {
  en: [
    'Every editing action of the three graphical editors can be done from the keyboard: moving a cursor, inserting an element, binding a ' +
      'variable from the declared symbols, connecting, and deleting. The palettes can be reached with Tab and are searchable, and each ' +
      'editor lists its own commands with F1.',
    '',
    '`Ctrl` is `Cmd` on macOS. A question that a key asks (the element to insert, the variable to bind, the wire to draw) is a search ' +
      'list: type to search, Up and Down choose, Enter takes the choice, Escape leaves. Where the list allows it, typing a name that is ' +
      'not in the list offers it as typed. A command that changes the document is one step of the undo history, and the selection ' +
      'comes back with undo and redo.',
  ].join('\n'),
  es: [
    'Todas las acciones de edición de los tres editores gráficos se pueden hacer con el teclado: mover un cursor, insertar un elemento, ' +
      'enlazar una variable entre los símbolos declarados, conectar y borrar. Las paletas se alcanzan con Tab y admiten búsqueda, y cada ' +
      'editor lista sus propios comandos con F1.',
    '',
    '`Ctrl` es `Cmd` en macOS. Una pregunta que hace una tecla (el elemento que se inserta, la variable que se enlaza, el cable que se ' +
      'dibuja) es una lista con búsqueda: se escribe para buscar, Arriba y Abajo eligen, Enter toma la elección y Escape sale. Donde la ' +
      'lista lo permite, escribir un nombre que no está en la lista lo ofrece tal como se escribió. Un comando que cambia el documento ' +
      'es un paso del historial de deshacer, y la selección vuelve con deshacer y rehacer.',
  ].join('\n'),
};

const COLUMNS: Record<Lang, [string, string]> = {
  en: ['Keys', 'What it does'],
  es: ['Teclas', 'Qué hace'],
};

function keysCell(action: KeyAction, lang: Lang): string {
  return action.keys.map((key) => code(key)).join(lang === 'en' ? ' or ' : ' o ');
}

/** The sections of one editor, one table for each group that has actions. */
function editorSection(editor: VisualEditor, lang: Lang): string {
  const actions = actionsOf(editor);
  const sections = KEY_GROUPS.flatMap((group) => {
    const own = actions.filter((action) => action.group === group);
    if (own.length === 0) return [];
    return [
      `### ${KEY_GROUP_TITLE[group][lang]}`,
      '',
      table(
        [...COLUMNS[lang]],
        own.map((action) => [keysCell(action, lang), prose(action.description[lang])]),
      ),
      '',
    ];
  });
  return [`## ${EDITOR_TITLE[editor][lang]}`, '', EDITOR_CURSOR[editor][lang], '', ...sections].join('\n').replace(/\n+$/, '');
}

export function keyboardBody(lang: Lang): string {
  return [INTRO[lang], ...VISUAL_EDITORS.map((editor) => editorSection(editor, lang))].join('\n\n');
}

export const PAGES: ReferencePage[] = [
  {
    path: 'reference/visual-editor-keyboard.md',
    title: { en: 'Keyboard reference of the visual editors', es: 'Referencia de teclado de los editores visuales' },
    label: { en: 'Visual editor keys', es: 'Teclas de los editores visuales' },
    description: {
      en:
        'Every key of the Ladder, Function Block Diagram and Sequential Function Chart editors, generated from the table the editors ' +
        'read.',
      es:
        'Todas las teclas de los editores de diagrama de escalera, de diagrama de bloques de función y de diagrama funcional ' +
        'secuencial, generadas de la tabla que leen los editores.',
    },
    body: keyboardBody,
  },
];

if (import.meta.main) {
  process.exit(runGenerator(GENERATOR, outputsOf(GENERATOR, PAGES), process.argv.slice(2)));
}
