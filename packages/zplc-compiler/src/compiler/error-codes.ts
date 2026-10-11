/**
 * The stable codes of the errors a build reports (CMP-006)
 *
 * SPDX-License-Identifier: MIT
 *
 * Every error of the compiler carries one of these codes, next to its message and its position. A code names the kind of
 * problem, not the sentence: the sentence names the identifier, the types and the numbers of this one, and may be
 * reworded; the code does not change, so a tool, a test or a person searching the reference can rely on it.
 *
 * This is the one list. The compiler's own errors (`CodegenError`, `LexerError`, `ParseError`, `CompilerError`), the Tool
 * API, the CLI, the MCP server and Studio read it, and the reference page `reference/diagnostic-codes` is generated from
 * it (`tools/docs/generate_diagnostic_codes.ts`). `error-examples.ts` holds, for each code, a source that provokes it with
 * the line, the column and the message it must give, and a test builds each of them.
 *
 * The warnings of a build that succeeds have their own list (`WARNING_CODES` in `diagnostics.ts`).
 * The same rules apply to both: a code is never reused for another meaning and never removed; a kind of error that
 * stops existing keeps its entry, marked in the reference.
 */

/** The phase of a build that finds an error. */
export type ErrorPhase = 'lexer' | 'parser' | 'codegen' | 'assembler';

export interface ErrorCodeInfo {
    /** The phases that report it. */
    phases: readonly ErrorPhase[];
    /** What it means, in one sentence, in English and in Spanish (the reference page is generated in both). */
    summary: { en: string; es: string };
}

export const ERROR_CODE_TABLE = {
    // ---- Lexical errors ---------------------------------------------------------------------------------------------
    UNEXPECTED_CHARACTER: {
        phases: ['lexer'],
        summary: {
            en: 'A character that is not part of the language appears outside a comment or a string.',
            es: 'Un carácter que no es parte del lenguaje aparece fuera de un comentario o de una cadena.',
        },
    },
    UNTERMINATED_COMMENT: {
        phases: ['lexer'],
        summary: {
            en: 'A comment is opened and never closed.',
            es: 'Un comentario se abre y nunca se cierra.',
        },
    },
    UNTERMINATED_STRING_LITERAL: {
        phases: ['lexer'],
        summary: {
            en: 'A STRING or WSTRING literal is not closed before the end of the line.',
            es: 'Un literal STRING o WSTRING no se cierra antes del fin de la línea.',
        },
    },
    INVALID_NUMBER_LITERAL: {
        phases: ['lexer'],
        summary: {
            en: 'A number is written in a form the language does not define: a digit separator in the wrong place, a base that is not 2, 8 or 16, a digit that is not valid in its base, or a base prefix without digits.',
            es: 'Un número está escrito en una forma que el lenguaje no define: un separador de dígitos mal ubicado, una base que no es 2, 8 ni 16, un dígito que no es válido en su base, o un prefijo de base sin dígitos.',
        },
    },
    INVALID_TYPED_LITERAL: {
        phases: ['lexer', 'parser'],
        summary: {
            en: 'A typed literal such as `INT#5` names an unknown type, has no value, has a value that does not belong to the type (a fraction in an integer, `BOOL#2`) or a value outside the range of the type.',
            es: 'Un literal tipado como `INT#5` nombra un tipo desconocido, no tiene valor, tiene un valor que no pertenece al tipo (una fracción en un entero, `BOOL#2`) o un valor fuera del rango del tipo.',
        },
    },

    // ---- Syntax errors ----------------------------------------------------------------------------------------------
    UNEXPECTED_TOKEN: {
        phases: ['parser'],
        summary: {
            en: 'The grammar does not allow the word or symbol that is written here; the message says what was expected.',
            es: 'La gramática no permite la palabra o el símbolo que está escrito aquí; el mensaje dice qué se esperaba.',
        },
    },
    UNSUPPORTED_CONSTRUCT: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'A construct of IEC 61131-3 that this release does not implement (a namespace, a pointer, a property, a textual configuration, a call form) is rejected by name instead of being compiled wrongly.',
            es: 'Una construcción de IEC 61131-3 que esta versión no implementa (un espacio de nombres, un puntero, una propiedad, una configuración textual, una forma de llamada) se rechaza por su nombre en lugar de compilarse mal.',
        },
    },
    INVALID_ARRAY_DECLARATION: {
        phases: ['parser'],
        summary: {
            en: 'An array declaration is not valid: more than three dimensions, a bound that is not an integer constant, or an upper bound below the lower bound.',
            es: 'Una declaración de arreglo no es válida: más de tres dimensiones, un límite que no es una constante entera, o un límite superior menor que el inferior.',
        },
    },
    CIRCULAR_TYPE_ALIAS: {
        phases: ['parser'],
        summary: {
            en: 'A type alias refers to itself, directly or through other aliases.',
            es: 'Un alias de tipo se refiere a sí mismo, directa o indirectamente a través de otros alias.',
        },
    },
    INVALID_STRING_CAPACITY: {
        phases: ['parser'],
        summary: {
            en: 'The capacity of a STRING or WSTRING is not an integer constant of 1 or more.',
            es: 'La capacidad de un STRING o WSTRING no es una constante entera de 1 o más.',
        },
    },
    INVALID_TIME_LITERAL: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'A TIME, DATE, TIME_OF_DAY or DATE_AND_TIME literal is malformed, is finer than TIME can hold (1 ms), or is outside the range of its type.',
            es: 'Un literal TIME, DATE, TIME_OF_DAY o DATE_AND_TIME está mal formado, es más fino de lo que TIME puede representar (1 ms), o está fuera del rango de su tipo.',
        },
    },
    INVALID_DIRECT_ADDRESS: {
        phases: ['parser'],
        summary: {
            en: 'A located variable (`AT %IX0.0`) has an address that does not follow the form `%` area, size, byte and bit.',
            es: 'Una variable ubicada (`AT %IX0.0`) tiene una dirección que no sigue la forma `%` área, tamaño, byte y bit.',
        },
    },
    INVALID_BIT_ACCESS: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'A bit access such as `w.3` names a bit that the type does not have, or is not written as a decimal number.',
            es: 'Un acceso a bit como `w.3` nombra un bit que el tipo no tiene, o no está escrito como un número decimal.',
        },
    },
    INVALID_ENUMERATION: {
        phases: ['parser'],
        summary: {
            en: 'The value of an enumeration member is not an integer literal.',
            es: 'El valor de un miembro de una enumeración no es un literal entero.',
        },
    },
    INVALID_FUNCTION_RETURN_TYPE: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'A function returns a type that a function cannot return: an array, a structure or a function block.',
            es: 'Una función devuelve un tipo que una función no puede devolver: un arreglo, una estructura o un bloque de función.',
        },
    },
    INVALID_OUTPUT_BINDING: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'The output binding `=>` is not used the way the language defines: it must name the variable that receives the output, and only a function block call has output bindings.',
            es: 'El enlace de salida `=>` no se usa como el lenguaje lo define: debe nombrar la variable que recibe la salida, y solo la llamada a un bloque de función tiene enlaces de salida.',
        },
    },

    // ---- Names, types and values ------------------------------------------------------------------------------------
    UNKNOWN_IDENTIFIER: {
        phases: ['codegen'],
        summary: {
            en: 'A name is used that no declaration in scope introduces.',
            es: 'Se usa un nombre que ninguna declaración en alcance introduce.',
        },
    },
    UNKNOWN_MEMBER: {
        phases: ['codegen'],
        summary: {
            en: 'A member is read or written that the structure or function block does not have.',
            es: 'Se lee o escribe un miembro que la estructura o el bloque de función no tiene.',
        },
    },
    UNKNOWN_TYPE: {
        phases: ['codegen', 'parser'],
        summary: {
            en: 'A data type, enumeration, function block type or interface is named that is not declared.',
            es: 'Se nombra un tipo de dato, una enumeración, un tipo de bloque de función o una interfaz que no está declarado.',
        },
    },
    UNKNOWN_FUNCTION: {
        phases: ['codegen'],
        summary: {
            en: 'A call names a function or function block instance that is not declared.',
            es: 'Una llamada nombra una función o una instancia de bloque de función que no está declarada.',
        },
    },
    UNKNOWN_METHOD: {
        phases: ['codegen'],
        summary: {
            en: 'A method is called that the function block, or the interface of the variable, does not have.',
            es: 'Se llama a un método que el bloque de función, o la interfaz de la variable, no tiene.',
        },
    },
    UNKNOWN_PARAMETER: {
        phases: ['codegen'],
        summary: {
            en: 'A call names an argument that the function, function block or method does not have.',
            es: 'Una llamada nombra un argumento que la función, el bloque de función o el método no tiene.',
        },
    },
    MISSING_ARGUMENT: {
        phases: ['codegen'],
        summary: {
            en: 'A call of a function leaves out a parameter that has no default.',
            es: 'Una llamada a una función omite un parámetro que no tiene valor por defecto.',
        },
    },
    INVALID_ARGUMENTS: {
        phases: ['codegen'],
        summary: {
            en: 'The arguments of a call do not fit its declaration: a parameter given twice, a positional argument after a named one, or the wrong number of arguments.',
            es: 'Los argumentos de una llamada no corresponden con su declaración: un parámetro dado dos veces, un argumento posicional después de uno con nombre, o una cantidad incorrecta de argumentos.',
        },
    },
    RECURSIVE_CALL: {
        phases: ['codegen'],
        summary: {
            en: 'A function or function block calls itself, directly or through other calls; the language has no recursion.',
            es: 'Una función o un bloque de función se llama a sí mismo, directa o indirectamente; el lenguaje no tiene recursión.',
        },
    },
    DUPLICATE_DECLARATION: {
        phases: ['codegen'],
        summary: {
            en: 'A name is declared twice in the same scope, or a function, function block, type or global is declared in two files of the project.',
            es: 'Un nombre se declara dos veces en el mismo alcance, o una función, un bloque de función, un tipo o una global se declara en dos archivos del proyecto.',
        },
    },
    TYPE_MISMATCH: {
        phases: ['codegen'],
        summary: {
            en: 'A value of one type is used where another is required: an assignment, an operand, a condition, an argument or an initial value.',
            es: 'Un valor de un tipo se usa donde se requiere otro: una asignación, un operando, una condición, un argumento o un valor inicial.',
        },
    },
    NARROWING_NOT_ALLOWED: {
        phases: ['codegen'],
        summary: {
            en: 'A value is stored in a narrower type and the project turns implicit narrowing into an error (`compiler.strictTypes`).',
            es: 'Un valor se guarda en un tipo más estrecho y el proyecto convierte el estrechamiento implícito en un error (`compiler.strictTypes`).',
        },
    },
    CONSTANT_OUT_OF_RANGE: {
        phases: ['codegen'],
        summary: {
            en: 'A constant does not fit the type it is stored in or compared with, or an integer literal does not fit 32 bits.',
            es: 'Una constante no cabe en el tipo en que se guarda o con el que se compara, o un literal entero no cabe en 32 bits.',
        },
    },
    STRING_TOO_LONG: {
        phases: ['codegen'],
        summary: {
            en: 'A string literal has more characters than the capacity of the variable it initialises or is assigned to.',
            es: 'Un literal de cadena tiene más caracteres que la capacidad de la variable que inicializa o a la que se asigna.',
        },
    },
    ASSIGNMENT_TO_CONSTANT: {
        phases: ['codegen'],
        summary: {
            en: 'A constant is assigned to, bound to an output, passed as an in-out parameter or referenced for writing.',
            es: 'Una constante recibe una asignación, se enlaza a una salida, se pasa como parámetro de entrada y salida o se referencia para escribirla.',
        },
    },
    INVALID_INITIALISER: {
        phases: ['codegen'],
        summary: {
            en: 'An initial value does not fit the declaration: the wrong form for the type, too many values, or an unknown member in a structure initialiser.',
            es: 'Un valor inicial no corresponde con la declaración: la forma incorrecta para el tipo, demasiados valores, o un miembro desconocido en el inicializador de una estructura.',
        },
    },
    INVALID_ARRAY_ACCESS: {
        phases: ['codegen', 'parser'],
        summary: {
            en: 'An index is applied to something that is not an array, with the wrong number of indices (more than three is never accepted), or with an index that is not a 32-bit integer.',
            es: 'Se aplica un índice a algo que no es un arreglo, con una cantidad incorrecta de índices, o con un índice que no es un entero de 32 bits.',
        },
    },
    INDEX_OUT_OF_BOUNDS: {
        phases: ['codegen'],
        summary: {
            en: 'A constant index lies outside the bounds of the array.',
            es: 'Un índice constante queda fuera de los límites del arreglo.',
        },
    },
    INVALID_MEMBER_ACCESS: {
        phases: ['codegen'],
        summary: {
            en: 'A member is accessed on something that has no members, or a whole structure or function block is used where a value is required.',
            es: 'Se accede a un miembro de algo que no tiene miembros, o se usa una estructura o un bloque de función completos donde se requiere un valor.',
        },
    },
    INVALID_REFERENCE: {
        phases: ['codegen'],
        summary: {
            en: 'A reference is created or followed in a way that is not allowed: dereferencing something that is not a `REF_TO` variable, assigning to one a value that is not a reference, or referencing a constant.',
            es: 'Una referencia se crea o se sigue de una manera no permitida: desreferenciar algo que no es una variable `REF_TO`, asignarle un valor que no es una referencia, o referenciar una constante.',
        },
    },
    INVALID_CASE_LABEL: {
        phases: ['codegen'],
        summary: {
            en: 'A `CASE` label is not an integer constant, a range is empty, the label does not fit the selector, or the selector is not an integer or an enumeration.',
            es: 'Una etiqueta de `CASE` no es una constante entera, un rango está vacío, la etiqueta no cabe en el selector, o el selector no es un entero ni una enumeración.',
        },
    },
    OVERLAPPING_CASE_LABELS: {
        phases: ['codegen'],
        summary: {
            en: 'Two labels of the same `CASE` select the same value.',
            es: 'Dos etiquetas del mismo `CASE` seleccionan el mismo valor.',
        },
    },
    INVALID_FOR_COUNTER: {
        phases: ['codegen'],
        summary: {
            en: 'The counter of a `FOR` loop is not a declared integer variable.',
            es: 'El contador de un bucle `FOR` no es una variable entera declarada.',
        },
    },
    JUMP_OUTSIDE_LOOP: {
        phases: ['codegen'],
        summary: {
            en: '`EXIT` or `CONTINUE` is written outside a `FOR`, `WHILE` or `REPEAT` loop.',
            es: '`EXIT` o `CONTINUE` está escrito fuera de un bucle `FOR`, `WHILE` o `REPEAT`.',
        },
    },
    UNSUPPORTED_ARGUMENT_TYPE: {
        phases: ['codegen'],
        summary: {
            en: 'A standard function is given a type it does not accept in this release (a 64-bit or LREAL argument where only 32 bits are defined, or a WSTRING).',
            es: 'A una función estándar se le da un tipo que no acepta en esta versión (un argumento de 64 bits o LREAL donde solo se definen 32 bits, o un WSTRING).',
        },
    },

    // ---- Function blocks, methods and interfaces --------------------------------------------------------------------
    INVALID_INHERITANCE: {
        phases: ['codegen'],
        summary: {
            en: 'A function block extends a block that is not declared, that is `FINAL`, or that extends it back.',
            es: 'Un bloque de función extiende un bloque que no está declarado, que es `FINAL`, o que lo extiende a él.',
        },
    },
    ABSTRACT_INSTANTIATION: {
        phases: ['codegen'],
        summary: {
            en: 'An instance of an `ABSTRACT` function block is declared.',
            es: 'Se declara una instancia de un bloque de función `ABSTRACT`.',
        },
    },
    INVALID_OVERRIDE: {
        phases: ['codegen'],
        summary: {
            en: 'A method is declared `OVERRIDE` with no base method, overrides a `FINAL` method, changes the return type, or hides an inherited method without `OVERRIDE`.',
            es: 'Un método se declara `OVERRIDE` sin método base, sobrescribe un método `FINAL`, cambia el tipo de retorno, u oculta un método heredado sin `OVERRIDE`.',
        },
    },
    INTERFACE_NOT_IMPLEMENTED: {
        phases: ['codegen'],
        summary: {
            en: 'A function block names an interface it does not fully implement, or a value is assigned to an interface variable that does not implement it.',
            es: 'Un bloque de función nombra una interfaz que no implementa por completo, o se asigna a una variable de interfaz un valor que no la implementa.',
        },
    },
    ACCESS_VIOLATION: {
        phases: ['codegen'],
        summary: {
            en: 'A method that is `PRIVATE` or `PROTECTED` is called from where its access specifier does not allow.',
            es: 'Un método `PRIVATE` o `PROTECTED` se llama desde donde su especificador de acceso no lo permite.',
        },
    },
    INVALID_THIS_OR_SUPER: {
        phases: ['codegen'],
        summary: {
            en: '`THIS` or `SUPER^` is used outside a function block or method, or `SUPER^` is used in a block that extends none.',
            es: '`THIS` o `SUPER^` se usa fuera de un bloque de función o método, o `SUPER^` se usa en un bloque que no extiende ninguno.',
        },
    },
    INVALID_EXTERNAL_DECLARATION: {
        phases: ['codegen'],
        summary: {
            en: 'A `VAR_EXTERNAL` has no `VAR_GLOBAL` of the same name, or declares another type than the global.',
            es: 'Un `VAR_EXTERNAL` no tiene un `VAR_GLOBAL` del mismo nombre, o declara un tipo distinto al de la global.',
        },
    },

    // ---- Memory, addresses and tags ---------------------------------------------------------------------------------
    WORK_MEMORY_EXCEEDED: {
        phases: ['codegen'],
        summary: {
            en: 'The variables of the project need more WORK memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers.',
            es: 'Las variables del proyecto necesitan más memoria WORK de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.',
        },
    },
    RETAIN_MEMORY_EXCEEDED: {
        phases: ['codegen'],
        summary: {
            en: 'The `RETAIN` variables of the project need more retentive memory than the target profile has. The message states the bytes required, the bytes available and the largest consumers.',
            es: 'Las variables `RETAIN` del proyecto necesitan más memoria retentiva de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.',
        },
    },
    CODE_MEMORY_EXCEEDED: {
        phases: ['codegen'],
        summary: {
            en: 'The generated program is larger than the code memory of the target profile. The message states the bytes required, the bytes available and the largest consumers.',
            es: 'El programa generado es mayor que la memoria de código del perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.',
        },
    },
    INVALID_MEMORY_PROFILE: {
        phases: ['codegen'],
        summary: {
            en: 'The target memory profile given to the compiler is not valid: a capacity that is not a positive integer or that exceeds what the virtual machine addresses.',
            es: 'El perfil de memoria del destino dado al compilador no es válido: una capacidad que no es un entero positivo o que excede lo que direcciona la máquina virtual.',
        },
    },
    ADDRESS_OUT_OF_REGION: {
        phases: ['codegen'],
        summary: {
            en: 'A located variable lies outside the input, output or memory area it names.',
            es: 'Una variable ubicada queda fuera del área de entradas, salidas o memoria que nombra.',
        },
    },
    ADDRESS_OVERLAP: {
        phases: ['codegen'],
        summary: {
            en: 'A located `%M` variable overlaps the storage of another variable, the initialization flag or the string pool.',
            es: 'Una variable ubicada `%M` se superpone con el almacenamiento de otra variable, con la bandera de inicialización o con el depósito de cadenas.',
        },
    },
    INVALID_LOCATED_VARIABLE: {
        phases: ['codegen'],
        summary: {
            en: 'A located variable has a size or a type that its address does not allow, such as a bit address on a variable that is not BOOL.',
            es: 'Una variable ubicada tiene un tamaño o un tipo que su dirección no permite, como una dirección de bit en una variable que no es BOOL.',
        },
    },
    INVALID_TAG: {
        phases: ['codegen'],
        summary: {
            en: 'A communication tag on a variable names a type or a region the tag cannot use, or a Modbus address outside 0 to 65535.',
            es: 'Una etiqueta de comunicación en una variable nombra un tipo o una región que la etiqueta no puede usar, o una dirección Modbus fuera de 0 a 65535.',
        },
    },
    STACK_DEPTH_EXCEEDED: {
        phases: ['codegen'],
        summary: {
            en: 'A task needs an evaluation stack or a call nesting deeper than the target holds, or its depth cannot be determined.',
            es: 'Una tarea necesita una pila de evaluación o un anidamiento de llamadas más profundos de lo que el destino admite, o su profundidad no se puede determinar.',
        },
    },

    // ---- Projects and tasks -----------------------------------------------------------------------------------------
    NO_PROGRAM: {
        phases: ['parser', 'codegen'],
        summary: {
            en: 'A source file of a program has no `PROGRAM`.',
            es: 'Un archivo fuente de un programa no tiene `PROGRAM`.',
        },
    },
    MULTIPLE_PROGRAMS_IN_SOURCE: {
        phases: ['codegen'],
        summary: {
            en: 'A source file declares more than one `PROGRAM`; each program has its own file.',
            es: 'Un archivo fuente declara más de un `PROGRAM`; cada programa tiene su propio archivo.',
        },
    },
    INVALID_TASK_CONFIGURATION: {
        phases: ['codegen'],
        summary: {
            en: 'The tasks of `zplc.json` are not valid: none, too many, a trigger that is not supported, an interval or a priority out of range, or a task that does not reference exactly one program.',
            es: 'Las tareas de `zplc.json` no son válidas: ninguna, demasiadas, un disparador no soportado, un intervalo o una prioridad fuera de rango, o una tarea que no referencia exactamente un programa.',
        },
    },
    UNKNOWN_TASK_PROGRAM: {
        phases: ['codegen'],
        summary: {
            en: 'A task names a program that is not among the sources of the project.',
            es: 'Una tarea nombra un programa que no está entre las fuentes del proyecto.',
        },
    },
    OUTPUT_OWNERSHIP_CONFLICT: {
        phases: ['codegen'],
        summary: {
            en: 'Two programs write the same physical output.',
            es: 'Dos programas escriben la misma salida física.',
        },
    },
    ASSEMBLER_ERROR: {
        phases: ['assembler'],
        summary: {
            en: 'The assembler refused the generated code, for example an operand or a relocated address that does not fit its field. It is a defect of the compiler when the source is valid.',
            es: 'El ensamblador rechazó el código generado, por ejemplo un operando o una dirección reubicada que no cabe en su campo. Es un defecto del compilador cuando la fuente es válida.',
        },
    },
    INTERNAL_COMPILER_ERROR: {
        phases: ['codegen', 'lexer', 'parser', 'assembler'],
        summary: {
            en: 'The compiler stopped on a condition it did not expect; the message names it. It is never a mistake of the program: report it with the source.',
            es: 'El compilador se detuvo ante una condición que no esperaba; el mensaje la nombra. Nunca es un error del programa: repórtelo con la fuente.',
        },
    },

    NO_BOARD_CHANNEL: {
        phases: ['codegen'],
        summary: {
            en: 'A located variable sits at an address where the board of the project has no channel; the message names the variable, the address and the board.',
            es: 'Una variable ubicada está en una dirección donde la placa del proyecto no tiene canal; el mensaje nombra la variable, la dirección y la placa.',
        },
    },

    // ---- Visual languages and instruction list ----------------------------------------------------------------------
    TRANSLATION_FAILED: {
        phases: ['codegen', 'parser'],
        summary: {
            en: 'A ladder, function block diagram, sequential function chart or instruction list source cannot be translated to Structured Text; the message names the element.',
            es: 'Una fuente de escalera, diagrama de bloques de función, diagrama funcional secuencial o lista de instrucciones no se puede traducir a Texto Estructurado; el mensaje nombra el elemento.',
        },
    },
} as const satisfies Record<string, ErrorCodeInfo>;

/** One code of an error. */
export type ErrorCode = keyof typeof ERROR_CODE_TABLE;

/** Every code, in the order of the reference page. */
export const ERROR_CODES = Object.keys(ERROR_CODE_TABLE) as readonly ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === 'string' && Object.hasOwn(ERROR_CODE_TABLE, value);
}
