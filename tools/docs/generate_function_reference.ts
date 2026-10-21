// The function and function-block reference, generated from the compiler registry (DOC-007).
//
//   bun tools/docs/generate_function_reference.ts           write docs/docs/reference/{functions,function-blocks}.md and the Spanish twins
//   bun tools/docs/generate_function_reference.ts --check   exit 1 when a page is stale, when a registered name has no entry in
//                                                           stdlib/reference.ts, or when an entry names something that is not registered
//
// The names, the number of parameters and the member layout of every block come from the registry
// (packages/zplc-compiler/src/compiler/stdlib/index.ts); the descriptions, types and examples from stdlib/reference.ts. The examples
// are fenced as runnable samples: `bun tools/docs/check-docs-samples.ts` compiles each one and runs it on the native runtime, so a
// value that a page states is a value that a run produced (VF-020). The type conversions are generated from CONVERSION_TYPES.
import { fence, code, prose, table, runGenerator, outputsOf, type L10n, type Lang, type ReferencePage } from './reference-lib';
import { getAllFBNames, getAllFnNames, getFB, getFn } from '../../packages/zplc-compiler/src/compiler/stdlib/index.ts';
import { CONVERSION_TYPES, conversionName, conversionResultType } from '../../packages/zplc-compiler/src/compiler/stdlib/conversions.ts';
import {
  BLOCK_CATEGORIES,
  BLOCK_DOCS,
  FUNCTION_CATEGORIES,
  FUNCTION_DOCS,
  type BlockDoc,
  type Category,
  type Example,
  type FunctionDoc,
  type PinDoc,
} from '../../packages/zplc-compiler/src/compiler/stdlib/reference.ts';

export const GENERATOR = 'tools/docs/generate_function_reference.ts';

const t = (text: L10n, lang: Lang) => text[lang];

/** The fence of an example: a whole program that the samples checker compiles and runs. */
export function exampleFence(example: Example): string {
  const info = [
    `pascal runnable expect="${example.expect}"`,
    ...(example.scans ? [`scans=${example.scans}`] : []),
    ...(example.scanMs ? [`scan_ms=${example.scanMs}`] : []),
  ].join(' ');
  return fence(info, `PROGRAM Example\n${example.source}\nEND_PROGRAM`);
}

const RESULT: L10n = {
  en: 'The docs job compiles this program and runs it on the native runtime; after the run',
  es: 'El trabajo de documentación compila este programa y lo ejecuta en el runtime nativo; tras la ejecución',
};

function resultSentence(example: Example, lang: Lang): string {
  const values = example.expect.split(' ').map((entry) => {
    const [name, value] = entry.split('=') as [string, string];
    return `${code(name.replace(/:.*/, ''))} = ${code(value)}`;
  });
  const scans = example.scans ?? 1;
  const when: L10n = {
    en: scans === 1 ? ' after one scan' : ` after ${scans} scans of ${example.scanMs ?? 10} ms`,
    es: scans === 1 ? ' tras un ciclo' : ` tras ${scans} ciclos de ${example.scanMs ?? 10} ms`,
  };
  return lang === 'en' ? `Result${when.en}: ${values.join(', ')}.` : `Resultado${when.es}: ${values.join(', ')}.`;
}

function section(
  categories: Category[],
  docs: Record<string, FunctionDoc | BlockDoc>,
  render: (name: string, doc: never) => string,
  lang: Lang,
  notes: Record<string, L10n> = {},
): string {
  return categories
    .flatMap((category) => {
      const names = Object.keys(docs).filter((name) => docs[name]!.category === category.id);
      if (names.length === 0) return [];
      const note = notes[category.id];
      return [`## ${category[lang]}`, ...(note ? [note[lang]] : []), ...names.map((name) => render(name, docs[name] as never))];
    })
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

const CONVERSION_RULES: Array<{ from: L10n; to: L10n; rule: L10n }> = [
  {
    from: { en: 'An integer', es: 'Un entero' },
    to: { en: 'A wider integer or the same width', es: 'Un entero más ancho o del mismo ancho' },
    rule: { en: 'The value keeps its value.', es: 'El valor conserva su valor.' },
  },
  {
    from: { en: 'An integer', es: 'Un entero' },
    to: { en: 'A narrower integer, or the other signedness', es: 'Un entero más angosto, o de otro signo' },
    rule: {
      en: "The low bits (two's complement wrap): `INT_TO_SINT(300)` is 44, `INT_TO_UINT(-1)` is 65535.",
      es: 'Los bits bajos (envoltura en complemento a dos): `INT_TO_SINT(300)` es 44, `INT_TO_UINT(-1)` es 65535.',
    },
  },
  {
    from: { en: 'An integer or TIME', es: 'Un entero o TIME' },
    to: { en: 'BOOL', es: 'BOOL' },
    rule: { en: 'FALSE for 0, TRUE for any other value.', es: 'FALSE para 0, TRUE para cualquier otro valor.' },
  },
  {
    from: { en: 'BOOL', es: 'BOOL' },
    to: { en: 'A numeric type', es: 'Un tipo numérico' },
    rule: { en: '0 or 1.', es: '0 o 1.' },
  },
  {
    from: { en: 'An integer', es: 'Un entero' },
    to: { en: 'REAL or LREAL', es: 'REAL o LREAL' },
    rule: { en: 'The nearest representable value.', es: 'El valor representable más cercano.' },
  },
  {
    from: { en: 'REAL or LREAL', es: 'REAL o LREAL' },
    to: { en: 'An integer', es: 'Un entero' },
    rule: {
      en:
        'The nearest integer, an exact half to the even integer (2.5 gives 2, 3.5 gives 4); a value out of range gives the nearest ' +
        'limit of the destination; NaN gives 0.',
      es:
        'El entero más cercano, una mitad exacta al entero par (2.5 da 2, 3.5 da 4); un valor fuera de rango da el límite más cercano ' +
        'del destino; NaN da 0.',
    },
  },
  {
    from: { en: 'REAL or LREAL', es: 'REAL o LREAL' },
    to: { en: 'BOOL', es: 'BOOL' },
    rule: {
      en: 'FALSE for 0.0 and -0.0, TRUE for any other value, NaN included.',
      es: 'FALSE para 0.0 y -0.0, TRUE para cualquier otro valor, NaN incluido.',
    },
  },
  {
    from: { en: 'TIME', es: 'TIME' },
    to: { en: 'A numeric type', es: 'Un tipo numérico' },
    rule: {
      en: 'Its count of milliseconds, as an unsigned 32-bit integer.',
      es: 'Su cuenta de milisegundos, como entero de 32 bits sin signo.',
    },
  },
];

const CELL_TYPES = new Set(['BOOL', 'SINT', 'USINT', 'BYTE', 'INT', 'UINT', 'WORD', 'DINT', 'UDINT', 'DWORD', 'REAL']);

/** One program per source type: it converts one value to each of the other fifteen types and states every result. */
export function conversionExample(from: string): Example {
  const literal = from === 'BOOL' ? 'TRUE' : from === 'TIME' ? 'T#5ms' : from === 'REAL' || from === 'LREAL' ? '5.0' : '5';
  const declarations = [`    Source : ${from} := ${literal};`];
  const statements: string[] = [];
  const expect: string[] = [];
  for (const to of CONVERSION_TYPES) {
    if (to === from) continue;
    const call = `${conversionName(from, to)}(Source)`;
    if (CELL_TYPES.has(to)) {
      declarations.push(`    To_${to} : ${to};`);
      statements.push(`To_${to} := ${call};`);
      expect.push(`To_${to}=${to === 'BOOL' ? 'TRUE' : from === 'BOOL' ? 1 : 5}`);
    } else {
      // a type that the checker cannot read is compared inside the program
      const wanted =
        from === 'BOOL' ? (to === 'TIME' ? 'T#1ms' : to === 'LREAL' ? '1.0' : '1') : to === 'TIME' ? 'T#5ms' : to === 'LREAL' ? '5.0' : '5';
      declarations.push(`    Is_${to} : BOOL;`);
      statements.push(`Is_${to} := ${call} = ${wanted};`);
      expect.push(`Is_${to}=TRUE`);
    }
  }
  return { source: `VAR\n${declarations.join('\n')}\nEND_VAR\n\n${statements.join('\n')}`, expect: expect.join(' ') };
}

function functionEntry(name: string, doc: FunctionDoc, lang: Lang): string {
  const parameters = doc.params.map(([parameter, type]) => `${parameter} : ${type}`);
  if (doc.variadic) parameters.push('...');
  const signature = `${name}(${parameters.join(', ')})${doc.returns === 'VOID' ? '' : ` : ${doc.returns}`}`;
  return [`### ${name}`, code(signature), prose(doc[lang]), exampleFence(doc.example), resultSentence(doc.example, lang)].join('\n\n');
}

const CONVERSION_INTRO: L10n = {
  en:
    'A conversion function exists for every ordered pair of different types among {types}: {count} functions, named `<FROM>_TO_<TO>` ' +
    '(`INT_TO_REAL`, `LREAL_TO_DINT`). `DATE`, `TOD` and `DT` have none yet. What a conversion does with a value that its destination ' +
    'cannot hold depends on the pair:',
  es:
    'Existe una función de conversión para cada par ordenado de tipos distintos entre {types}: {count} funciones, con el nombre ' +
    '`<DESDE>_TO_<HACIA>` (`INT_TO_REAL`, `LREAL_TO_DINT`). `DATE`, `TOD` y `DT` aún no tienen. Lo que hace una conversión con un valor ' +
    'que el destino no puede contener depende del par:',
};

function conversionSection(lang: Lang): string {
  const head: L10n = { en: 'Type conversions', es: 'Conversiones de tipo' };
  const columns = lang === 'en' ? ['From', 'To', 'Result'] : ['Desde', 'Hacia', 'Resultado'];
  const intro = CONVERSION_INTRO[lang]
    .replace('{types}', CONVERSION_TYPES.map((type) => code(type)).join(', '))
    .replace('{count}', String(CONVERSION_TYPES.length * (CONVERSION_TYPES.length - 1)));
  const sources = CONVERSION_TYPES.map((from) => {
    const names = CONVERSION_TYPES.filter((to) => to !== from)
      .map((to) => code(conversionName(from, to)))
      .join(', ');
    const example = conversionExample(from);
    const heading = lang === 'en' ? `### From ${from}` : `### Desde ${from}`;
    const lead = lang === 'en' ? `Functions: ${names}.` : `Funciones: ${names}.`;
    const value = from === 'BOOL' ? '1' : '5';
    const result: L10n = {
      en: `Result after one scan: each ${code('To_*')} variable holds ${code(value)} (${code(
        'To_BOOL',
      )} holds ${code('TRUE')}) and each ${code('Is_*')} variable holds ${code('TRUE')}.`,
      es: `Resultado tras un ciclo: cada variable ${code('To_*')} vale ${code(value)} (${code(
        'To_BOOL',
      )} vale ${code('TRUE')}) y cada variable ${code('Is_*')} vale ${code('TRUE')}.`,
    };
    return [heading, lead, exampleFence(example), result[lang]].join('\n\n');
  });
  return [
    `## ${head[lang]}`,
    intro,
    table(
      columns,
      CONVERSION_RULES.map((rule) => [prose(rule.from[lang]), prose(rule.to[lang]), prose(rule.rule[lang])]),
    ),
    ...sources,
  ].join('\n\n');
}

const FUNCTIONS_INTRO: L10n = {
  en:
    'Every function of the compiler registry, with its signature, what it does and an example. The registry has {total} functions: the ' +
    '{named} named functions below and the {conversions} type conversions. `ANY`, `ANY_NUM`, `ANY_INT` and `ANY_BIT` stand for the ' +
    'family of types that the function accepts. The language elements that call them are in the [languages ' +
    'overview](../languages/index.md); the blocks with state are in the [function-block reference](./function-blocks.md).',
  es:
    'Todas las funciones del registro del compilador, con su firma, lo que hacen y un ejemplo. El registro tiene {total} funciones: ' +
    'las {named} funciones con nombre de abajo y las {conversions} conversiones de tipo. `ANY`, `ANY_NUM`, `ANY_INT` y `ANY_BIT` ' +
    'representan la familia de tipos que la función acepta. Los elementos del lenguaje que las llaman están en la [vista general de ' +
    'lenguajes](../languages/index.md); los bloques con estado están en la [referencia de bloques de función](./function-blocks.md).',
};

const EXECUTED: L10n = {
  en:
    'Every example is a complete program. CI compiles it and runs it on the native POSIX runtime, and the result stated under it is ' +
    'the value that the run checks.',
  es:
    'Cada ejemplo es un programa completo. CI lo compila y lo ejecuta en el runtime POSIX nativo, y el resultado indicado debajo es el ' +
    'valor que la ejecución comprueba.',
};

export function functionsBody(lang: Lang): string {
  const named = Object.keys(FUNCTION_DOCS).length;
  const conversions = getAllFnNames().length - named;
  const intro = FUNCTIONS_INTRO[lang]
    .replace('{total}', String(named + conversions))
    .replace('{named}', String(named))
    .replace('{conversions}', String(conversions));
  return [
    intro,
    EXECUTED[lang],
    section(FUNCTION_CATEGORIES, FUNCTION_DOCS, (name, doc: FunctionDoc) => functionEntry(name, doc, lang), lang),
    conversionSection(lang),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Function blocks
// ---------------------------------------------------------------------------

const DIRECTION: Record<Lang, { in: string; out: string }> = { en: { in: 'Input', out: 'Output' }, es: { in: 'Entrada', out: 'Salida' } };
const PIN_HEAD: Record<Lang, string[]> = {
  en: ['Pin', 'Direction', 'Type', 'Initial', 'Description'],
  es: ['Pin', 'Dirección', 'Tipo', 'Inicial', 'Descripción'],
};

const ZERO: Record<string, string> = { BOOL: 'FALSE', TIME: 'T#0ms', REAL: '0.0', STRING: "''" };

function pinRow(block: string, pin: PinDoc, lang: Lang): string[] {
  const member = getFB(block)!.members.find((candidate) => candidate.name === pin.name)!;
  return [
    code(pin.name),
    member.isOutput ? DIRECTION[lang].out : DIRECTION[lang].in,
    code(pin.type),
    code(pin.initial ?? ZERO[pin.type] ?? '0'),
    prose(pin[lang]),
  ];
}

function blockEntry(name: string, doc: BlockDoc, lang: Lang): string {
  const direct = (pin: PinDoc) => (getFB(name)!.members.find((member) => member.name === pin.name)!.isOutput ? 1 : 0);
  const pins = [...doc.pins].sort((a, b) => direct(a) - direct(b));
  return [
    `### ${name}`,
    prose(doc[lang]),
    table(
      PIN_HEAD[lang],
      pins.map((pin) => pinRow(name, pin, lang)),
    ),
    exampleFence(doc.example),
    resultSentence(doc.example, lang),
  ].join('\n\n');
}

const BLOCKS_INTRO: L10n = {
  en:
    'Every function block of the compiler registry, with its pin table and an example. The registry has {count} blocks. A block is ' +
    'declared as a variable (`Delay : TON;`) and called with its inputs (`Delay(IN := Start, PT := T#2s);`); its outputs are read as ' +
    'members (`Delay.Q`). A new instance starts with every pin at the zero of its type, as the Initial column says. The functions ' +
    'without state are in the [function reference](./functions.md).',
  es:
    'Todos los bloques de función del registro del compilador, con su tabla de pines y un ejemplo. El registro tiene {count} bloques. ' +
    'Un bloque se declara como variable (`Delay : TON;`) y se llama con sus entradas (`Delay(IN := Start, PT := T#2s);`); sus salidas se ' +
    'leen como miembros (`Delay.Q`). Una instancia nueva empieza con cada pin en el cero de su tipo, como indica la columna Inicial. ' +
    'Las funciones sin estado están en la [referencia de funciones](./functions.md).',
};

const PEERLESS: L10n = {
  en:
    'The examples of these blocks run on the native host runtime, which has no Modbus server, MQTT broker or cloud service to talk to: ' +
    'each block ends with `ERROR` TRUE and `STATUS` 3 (no handler). They prove that the block compiles, runs and reports its status, and ' +
    'nothing about an exchange with a peer: what has been verified for each block, and against what, is stated in the how-to pages for ' +
    '[Modbus](../guides/modbus.md), [MQTT and Sparkplug B](../guides/mqtt-sparkplug.md) and [the ' +
    'cloud blocks](../guides/cloud-blocks.md).',
  es:
    'Los ejemplos de estos bloques se ejecutan en el runtime nativo del host, que no tiene servidor Modbus, broker MQTT ni servicio en ' +
    'la nube con quien hablar: cada bloque termina con `ERROR` en TRUE y `STATUS` 3 (sin manejador). Prueban que el bloque compila, se ' +
    'ejecuta e informa su estado, y nada sobre un intercambio con un par: lo que se ha verificado de cada bloque, y contra qué, se ' +
    'indica en las guías prácticas de [Modbus](../guides/modbus.md), [MQTT y Sparkplug B](../guides/mqtt-sparkplug.md) y [los ' +
    'bloques de nube](../guides/cloud-blocks.md).',
};

export function blocksBody(lang: Lang): string {
  const intro = BLOCKS_INTRO[lang].replace('{count}', String(getAllFBNames().length));
  const notes = { modbus: PEERLESS, mqtt: PEERLESS, cloud: PEERLESS };
  return [
    intro,
    EXECUTED[lang],
    section(BLOCK_CATEGORIES, BLOCK_DOCS, (name, doc: BlockDoc) => blockEntry(name, doc, lang), lang, notes),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Completeness, pages
// ---------------------------------------------------------------------------

/** The registered names that have no entry, and the entries that name nothing: each is a failure of the generator and of CI. */
export function registryErrors(
  functionDocs: Record<string, unknown> = FUNCTION_DOCS,
  blockDocs: Record<string, BlockDoc> = BLOCK_DOCS,
): string[] {
  const errors: string[] = [];
  const registeredFunctions = getAllFnNames().filter((name) => conversionResultType(name) === undefined);
  for (const name of registeredFunctions)
    if (!(name in functionDocs)) errors.push(`function ${name} is registered and has no entry in stdlib/reference.ts`);
  for (const name of Object.keys(functionDocs))
    if (getFn(name) === undefined) errors.push(`stdlib/reference.ts documents the function ${name}, which is not registered`);
  for (const name of getAllFBNames())
    if (!(name in blockDocs)) errors.push(`function block ${name} is registered and has no entry in stdlib/reference.ts`);
  for (const name of Object.keys(blockDocs))
    if (getFB(name) === undefined) errors.push(`stdlib/reference.ts documents the function block ${name}, which is not registered`);
  const conversions = getAllFnNames().filter((name) => conversionResultType(name) !== undefined).length;
  if (conversions !== CONVERSION_TYPES.length * (CONVERSION_TYPES.length - 1))
    errors.push(
      `${conversions} type conversions are registered, the pages list ${CONVERSION_TYPES.length * (CONVERSION_TYPES.length - 1)}`,
    );
  for (const [name, doc] of Object.entries(blockDocs)) {
    const block = getFB(name);
    if (block === undefined) continue;
    const members = new Set(block.members.filter((member) => !member.isInternal).map((member) => member.name));
    for (const pin of doc.pins) if (!members.has(pin.name)) errors.push(`${name}: the pin ${pin.name} is not a member of the block`);
    for (const member of members)
      if (!doc.pins.some((pin) => pin.name === member)) errors.push(`${name}: the member ${member} has no pin entry`);
  }
  return errors;
}

export const PAGES: ReferencePage[] = [
  {
    path: 'reference/functions.md',
    title: { en: 'Function reference', es: 'Referencia de funciones' },
    label: { en: 'Functions', es: 'Funciones' },
    description: {
      en: 'Every function of the ZPLC compiler registry: signature, behaviour and an example that CI runs.',
      es: 'Todas las funciones del registro del compilador ZPLC: firma, comportamiento y un ejemplo que CI ejecuta.',
    },
    body: functionsBody,
  },
  {
    path: 'reference/function-blocks.md',
    title: { en: 'Function block reference', es: 'Referencia de bloques de función' },
    label: { en: 'Function blocks', es: 'Bloques de función' },
    description: {
      en: 'Every function block of the ZPLC compiler registry: pin table, behaviour and an example that CI runs.',
      es: 'Todos los bloques de función del registro del compilador ZPLC: tabla de pines, comportamiento y un ejemplo que CI ejecuta.',
    },
    body: blocksBody,
  },
];

if (import.meta.main) {
  const errors = registryErrors();
  process.exit(runGenerator(GENERATOR, errors.length > 0 ? [] : outputsOf(GENERATOR, PAGES), process.argv.slice(2), errors));
}
