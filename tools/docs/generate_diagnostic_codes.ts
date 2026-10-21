// The reference of the error codes of a build, generated from the registry of the compiler (CMP-006).
//
//   bun tools/docs/generate_diagnostic_codes.ts           write docs/docs/reference/diagnostic-codes.md and the Spanish twin
//   bun tools/docs/generate_diagnostic_codes.ts --check   exit 1 when a page is stale
//
// The codes, the phases that report them and what each one means come from
// packages/zplc-compiler/src/compiler/error-codes.ts; the program that provokes a code, and the position and the message
// it gets, from error-examples.ts, which the compiler's own test builds. Nothing on the page is written by hand but the
// introduction and the headings.
import { ERROR_CODES, ERROR_CODE_TABLE, type ErrorCode, type ErrorPhase } from '../../packages/zplc-compiler/src/compiler/error-codes.ts';
import { ERROR_EXAMPLES } from '../../packages/zplc-compiler/src/compiler/error-examples.ts';
import { code, fence, outputsOf, prose, runGenerator, table, type L10n, type Lang, type ReferencePage } from './reference-lib';

export const GENERATOR = 'tools/docs/generate_diagnostic_codes.ts';

const PHASE_TITLE: Record<ErrorPhase, L10n> = {
  lexer: { en: 'Reading the characters (lexer)', es: 'Lectura de los caracteres (analizador léxico)' },
  parser: { en: 'Reading the structure (parser)', es: 'Lectura de la estructura (analizador sintáctico)' },
  codegen: {
    en: 'Names, types and memory (code generation and project)',
    es: 'Nombres, tipos y memoria (generación de código y proyecto)',
  },
  assembler: { en: 'Assembling the code', es: 'Ensamblado del código' },
};

const PHASE_ORDER: readonly ErrorPhase[] = ['lexer', 'parser', 'codegen', 'assembler'];

const INTRO: L10n = {
  en: [
    'Every error of a build carries a **code**: a name for the kind of problem, such as `UNKNOWN_IDENTIFIER`. The sentence of the ' +
      'message names the identifier, the types and the numbers of this one and may be reworded; the code does not change, so a script, a ' +
      'test or a person who searches this page can rely on it. A code is never reused for another meaning and never removed.',
    '',
    'The code is reported wherever the error is: the `code` field of every diagnostic of the command line (`--json`), of the Tool API ' +
      'and of the MCP tools; the end of the line that `zplc-cli` prints, in brackets; the label of the problem in the Problems tab of ' +
      'ZPLC; and the marker of the editor. Each diagnostic also has the position where it starts (`line` and `column`, from 1), the ' +
      'position just after where it ends (`endLine` and `endColumn`), the project file (`path`) and the phase that found it (`phase`).',
    '',
    'The warnings of a build that succeeds have codes of their own: see [Compiler workflow](../ide/compiler.md#warnings).',
  ].join('\n'),
  es: [
    'Cada error de una compilación lleva un **código**: un nombre para el tipo de problema, como `UNKNOWN_IDENTIFIER`. La frase del ' +
      'mensaje nombra el identificador, los tipos y los números de este caso y puede reformularse; el código no cambia, de modo que un ' +
      'script, una prueba o una persona que busque en esta página pueden confiar en él. Un código nunca se reutiliza para otro ' +
      'significado ni se elimina.',
    '',
    'El código se informa donde esté el error: el campo `code` de cada diagnóstico de la línea de comandos (`--json`), de la API de ' +
      'herramientas y de las herramientas MCP; el final de la línea que imprime `zplc-cli`, entre corchetes; la etiqueta del problema en ' +
      'la pestaña Problems de ZPLC; y el marcador del editor. Cada diagnóstico tiene además la posición donde empieza (`line` y ' +
      '`column`, desde 1), la posición justo después de donde termina (`endLine` y `endColumn`), el archivo del proyecto (`path`) y ' +
      'la fase que lo encontró (`phase`).',
    '',
    'Las advertencias de una compilación que tiene éxito tienen sus propios códigos: vea [Flujo ' +
      'del compilador](../ide/compiler.md#advertencias).',
  ].join('\n'),
};

const MEMORY: Record<Lang, { heading: string; text: string }> = {
  en: {
    heading: 'When the program does not fit',
    text: [
      'The memory a program can use is limited by the target profile only: the board that the project names, or the host. A program that ' +
        'does not fit is a build error that says how much it needs, how much the profile has and what takes the most, and that is ' +
        'reported at the declaration of the variable that crosses the end, or at the program or function that is the largest:',
      '',
      '- `WORK_MEMORY_EXCEEDED`: the variables of every program of the project, with the literals of the strings, in the work memory of ' +
        'the profile (one byte of it is the initialization flag).',
      '- `RETAIN_MEMORY_EXCEEDED`: the `RETAIN` variables, in the retentive memory of the profile.',
      '- `CODE_MEMORY_EXCEEDED`: the generated program, in the code memory of the profile. The consumers are the programs and functions ' +
        'that were written, and the library routines the code calls.',
    ].join('\n'),
  },
  es: {
    heading: 'Cuando el programa no cabe',
    text: [
      'La memoria que un programa puede usar está limitada solo por el perfil del destino: la placa que nombra el proyecto, o el ' +
        'anfitrión. Un programa que no cabe es un error de compilación que dice cuánto necesita, cuánto tiene el perfil y qué ocupa más, ' +
        'y se informa en la declaración de la variable que cruza el final, o en el programa o la función más grande:',
      '',
      '- `WORK_MEMORY_EXCEEDED`: las variables de todos los programas del proyecto, con los literales de las cadenas, en la memoria de ' +
        'trabajo del perfil (un byte de ella es la bandera de inicialización).',
      '- `RETAIN_MEMORY_EXCEEDED`: las variables `RETAIN`, en la memoria retentiva del perfil.',
      '- `CODE_MEMORY_EXCEEDED`: el programa generado, en la memoria de código del perfil. Los consumidores son los programas y ' +
        'funciones escritos, y las rutinas de biblioteca que el código llama.',
    ].join('\n'),
  },
};

const LABELS = {
  codes: { en: 'The codes', es: 'Los códigos' } satisfies L10n,
  examples: { en: 'Examples', es: 'Ejemplos' } satisfies L10n,
  examplesIntro: {
    en:
      'Each example is a program that the compiler refuses with that code; the position and the message are the ones its build ' +
      'reports, and a test of the compiler builds each of them.',
    es:
      'Cada ejemplo es un programa que el compilador rechaza con ese código; la posición y el mensaje son los que informa su ' +
      'compilación, y una prueba del compilador compila cada uno.',
  } satisfies L10n,
  columns: { en: ['Code', 'What it means'], es: ['Código', 'Qué significa'] } satisfies Record<Lang, [string, string]>,
  at: { en: 'Reported at', es: 'Se informa en' } satisfies L10n,
  of: { en: 'of', es: 'de' } satisfies L10n,
  message: { en: 'Message', es: 'Mensaje' } satisfies L10n,
  internal: {
    en:
      'No program provokes this code: it is for a defect of the compiler, or for an error of a part that is not the compiler (the ' +
      'translators of the visual languages, the admission of the located variables against a board).',
    es:
      'Ningún programa provoca este código: es para un defecto del compilador, o para un error de una parte que no es el compilador ' +
      '(los traductores de los lenguajes visuales, la admisión de las variables ubicadas contra una placa).',
  } satisfies L10n,
};

/** The phase under which a code is listed: the first that reports it. */
function phaseOf(codeName: ErrorCode): ErrorPhase {
  return (ERROR_CODE_TABLE[codeName] as { phases: readonly ErrorPhase[] }).phases[0]!;
}

function summaryOf(codeName: ErrorCode, lang: Lang): string {
  return (ERROR_CODE_TABLE[codeName] as { summary: L10n }).summary[lang];
}

function codesSection(lang: Lang): string {
  const parts: string[] = [`## ${LABELS.codes[lang]}`, ''];
  for (const phase of PHASE_ORDER) {
    const own = ERROR_CODES.filter((each) => phaseOf(each) === phase);
    if (own.length === 0) continue;
    parts.push(
      `### ${PHASE_TITLE[phase][lang]}`,
      '',
      table(
        [...LABELS.columns[lang]],
        own.map((each) => [code(each), prose(summaryOf(each, lang))]),
      ),
      '',
    );
  }
  return parts.join('\n').replace(/\n+$/, '');
}

function examplesSection(lang: Lang): string {
  const parts: string[] = [`## ${LABELS.examples[lang]}`, '', prose(LABELS.examplesIntro[lang]), ''];
  for (const each of ERROR_CODES) {
    parts.push(`### ${each}`, '', prose(summaryOf(each, lang)), '');
    const example = ERROR_EXAMPLES[each];
    if (example === undefined) {
      parts.push(prose(LABELS.internal[lang]), '');
      continue;
    }
    const files = example.files ?? { Main: example.source ?? '' };
    for (const [name, text] of Object.entries(files)) {
      parts.push(fence('text', `${Object.keys(files).length > 1 ? `(* src/${name}.st *)\n` : ''}${text}`), '');
    }
    const place = `${example.file === undefined ? '' : `${code(example.file)} `}${code(`${example.line}:${example.column}`)}`;
    parts.push(`${LABELS.at[lang]}: ${place}. ${LABELS.message[lang]}: ${code(example.message)}`, '');
  }
  return parts.join('\n').replace(/\n+$/, '');
}

export function diagnosticCodesBody(lang: Lang): string {
  return [INTRO[lang], `## ${MEMORY[lang].heading}\n\n${MEMORY[lang].text}`, codesSection(lang), examplesSection(lang)].join('\n\n');
}

export const PAGES: ReferencePage[] = [
  {
    path: 'reference/diagnostic-codes.md',
    title: { en: 'Diagnostic codes', es: 'Códigos de diagnóstico' },
    label: { en: 'Diagnostic codes', es: 'Códigos de diagnóstico' },
    description: {
      en: 'The stable code of every error of a build, what it means and a program that provokes it, generated from the compiler registry.',
      es:
        'El código estable de cada error de una compilación, qué significa y un programa que lo provoca, generado del registro del ' +
        'compilador.',
    },
    body: diagnosticCodesBody,
  },
];

if (import.meta.main) {
  process.exit(runGenerator(GENERATOR, outputsOf(GENERATOR, PAGES), process.argv.slice(2)));
}
