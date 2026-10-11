---
title: "Códigos de diagnóstico"
sidebar_label: "Códigos de diagnóstico"
description: "El código estable de cada error de una compilación, qué significa y un programa que lo provoca, generado del registro del compilador."
tags: [reference, generated]
---

# Códigos de diagnóstico

{/* >>> GENERATED (tools/docs/generate_diagnostic_codes.ts): reference/diagnostic-codes. Do not edit. >>> */}

Cada error de una compilación lleva un **código**: un nombre para el tipo de problema, como `UNKNOWN_IDENTIFIER`. La frase del mensaje nombra el identificador, los tipos y los números de este caso y puede reformularse; el código no cambia, de modo que un script, una prueba o una persona que busque en esta página pueden confiar en él. Un código nunca se reutiliza para otro significado ni se elimina.

El código se informa donde esté el error: el campo `code` de cada diagnóstico de la línea de comandos (`--json`), de la API de herramientas y de las herramientas MCP; el final de la línea que imprime `zplc-cli`, entre corchetes; la etiqueta del problema en la pestaña Problems de Studio; y el marcador del editor. Cada diagnóstico tiene además la posición donde empieza (`line` y `column`, desde 1), la posición justo después de donde termina (`endLine` y `endColumn`), el archivo del proyecto (`path`) y la fase que lo encontró (`phase`).

Las advertencias de una compilación que tiene éxito tienen sus propios códigos: vea [Flujo del compilador](../ide/compiler.md#advertencias).

## Cuando el programa no cabe

La memoria que un programa puede usar está limitada solo por el perfil del destino: la placa que nombra el proyecto, o el anfitrión. Un programa que no cabe es un error de compilación que dice cuánto necesita, cuánto tiene el perfil y qué ocupa más, y se informa en la declaración de la variable que cruza el final, o en el programa o la función más grande:

- `WORK_MEMORY_EXCEEDED`: las variables de todos los programas del proyecto, con los literales de las cadenas, en la memoria de trabajo del perfil (un byte de ella es la bandera de inicialización).
- `RETAIN_MEMORY_EXCEEDED`: las variables `RETAIN`, en la memoria retentiva del perfil.
- `CODE_MEMORY_EXCEEDED`: el programa generado, en la memoria de código del perfil. Los consumidores son los programas y funciones escritos, y las rutinas de biblioteca que el código llama.

## Los códigos

### Lectura de los caracteres (analizador léxico)

| Código | Qué significa |
| --- | --- |
| `UNEXPECTED_CHARACTER` | Un carácter que no es parte del lenguaje aparece fuera de un comentario o de una cadena. |
| `UNTERMINATED_COMMENT` | Un comentario se abre y nunca se cierra. |
| `UNTERMINATED_STRING_LITERAL` | Un literal STRING o WSTRING no se cierra antes del fin de la línea. |
| `INVALID_NUMBER_LITERAL` | Un número está escrito en una forma que el lenguaje no define: un separador de dígitos mal ubicado, una base que no es 2, 8 ni 16, un dígito que no es válido en su base, o un prefijo de base sin dígitos. |
| `INVALID_TYPED_LITERAL` | Un literal tipado como `INT#5` nombra un tipo desconocido, no tiene valor, tiene un valor que no pertenece al tipo (una fracción en un entero, `BOOL#2`) o un valor fuera del rango del tipo. |

### Lectura de la estructura (analizador sintáctico)

| Código | Qué significa |
| --- | --- |
| `UNEXPECTED_TOKEN` | La gramática no permite la palabra o el símbolo que está escrito aquí; el mensaje dice qué se esperaba. |
| `UNSUPPORTED_CONSTRUCT` | Una construcción de IEC 61131-3 que esta versión no implementa (un espacio de nombres, un puntero, una propiedad, una configuración textual, una forma de llamada) se rechaza por su nombre en lugar de compilarse mal. |
| `INVALID_ARRAY_DECLARATION` | Una declaración de arreglo no es válida: más de tres dimensiones, un límite que no es una constante entera, o un límite superior menor que el inferior. |
| `CIRCULAR_TYPE_ALIAS` | Un alias de tipo se refiere a sí mismo, directa o indirectamente a través de otros alias. |
| `INVALID_STRING_CAPACITY` | La capacidad de un STRING o WSTRING no es una constante entera de 1 o más. |
| `INVALID_TIME_LITERAL` | Un literal TIME, DATE, TIME_OF_DAY o DATE_AND_TIME está mal formado, es más fino de lo que TIME puede representar (1 ms), o está fuera del rango de su tipo. |
| `INVALID_DIRECT_ADDRESS` | Una variable ubicada (`AT %IX0.0`) tiene una dirección que no sigue la forma `%` área, tamaño, byte y bit. |
| `INVALID_BIT_ACCESS` | Un acceso a bit como `w.3` nombra un bit que el tipo no tiene, o no está escrito como un número decimal. |
| `INVALID_ENUMERATION` | El valor de un miembro de una enumeración no es un literal entero. |
| `INVALID_FUNCTION_RETURN_TYPE` | Una función devuelve un tipo que una función no puede devolver: un arreglo, una estructura o un bloque de función. |
| `INVALID_OUTPUT_BINDING` | El enlace de salida `=>` no se usa como el lenguaje lo define: debe nombrar la variable que recibe la salida, y solo la llamada a un bloque de función tiene enlaces de salida. |
| `NO_PROGRAM` | Un archivo fuente de un programa no tiene `PROGRAM`. |

### Nombres, tipos y memoria (generación de código y proyecto)

| Código | Qué significa |
| --- | --- |
| `UNKNOWN_IDENTIFIER` | Se usa un nombre que ninguna declaración en alcance introduce. |
| `UNKNOWN_MEMBER` | Se lee o escribe un miembro que la estructura o el bloque de función no tiene. |
| `UNKNOWN_TYPE` | Se nombra un tipo de dato, una enumeración, un tipo de bloque de función o una interfaz que no está declarado. |
| `UNKNOWN_FUNCTION` | Una llamada nombra una función o una instancia de bloque de función que no está declarada. |
| `UNKNOWN_METHOD` | Se llama a un método que el bloque de función, o la interfaz de la variable, no tiene. |
| `UNKNOWN_PARAMETER` | Una llamada nombra un argumento que la función, el bloque de función o el método no tiene. |
| `MISSING_ARGUMENT` | Una llamada a una función omite un parámetro que no tiene valor por defecto. |
| `INVALID_ARGUMENTS` | Los argumentos de una llamada no corresponden con su declaración: un parámetro dado dos veces, un argumento posicional después de uno con nombre, o una cantidad incorrecta de argumentos. |
| `RECURSIVE_CALL` | Una función o un bloque de función se llama a sí mismo, directa o indirectamente; el lenguaje no tiene recursión. |
| `DUPLICATE_DECLARATION` | Un nombre se declara dos veces en el mismo alcance, o una función, un bloque de función, un tipo o una global se declara en dos archivos del proyecto. |
| `TYPE_MISMATCH` | Un valor de un tipo se usa donde se requiere otro: una asignación, un operando, una condición, un argumento o un valor inicial. |
| `NARROWING_NOT_ALLOWED` | Un valor se guarda en un tipo más estrecho y el proyecto convierte el estrechamiento implícito en un error (`compiler.strictTypes`). |
| `CONSTANT_OUT_OF_RANGE` | Una constante no cabe en el tipo en que se guarda o con el que se compara, o un literal entero no cabe en 32 bits. |
| `STRING_TOO_LONG` | Un literal de cadena tiene más caracteres que la capacidad de la variable que inicializa o a la que se asigna. |
| `ASSIGNMENT_TO_CONSTANT` | Una constante recibe una asignación, se enlaza a una salida, se pasa como parámetro de entrada y salida o se referencia para escribirla. |
| `INVALID_INITIALISER` | Un valor inicial no corresponde con la declaración: la forma incorrecta para el tipo, demasiados valores, o un miembro desconocido en el inicializador de una estructura. |
| `INVALID_ARRAY_ACCESS` | Se aplica un índice a algo que no es un arreglo, con una cantidad incorrecta de índices, o con un índice que no es un entero de 32 bits. |
| `INDEX_OUT_OF_BOUNDS` | Un índice constante queda fuera de los límites del arreglo. |
| `INVALID_MEMBER_ACCESS` | Se accede a un miembro de algo que no tiene miembros, o se usa una estructura o un bloque de función completos donde se requiere un valor. |
| `INVALID_REFERENCE` | Una referencia se crea o se sigue de una manera no permitida: desreferenciar algo que no es una variable `REF_TO`, asignarle un valor que no es una referencia, o referenciar una constante. |
| `INVALID_CASE_LABEL` | Una etiqueta de `CASE` no es una constante entera, un rango está vacío, la etiqueta no cabe en el selector, o el selector no es un entero ni una enumeración. |
| `OVERLAPPING_CASE_LABELS` | Dos etiquetas del mismo `CASE` seleccionan el mismo valor. |
| `INVALID_FOR_COUNTER` | El contador de un bucle `FOR` no es una variable entera declarada. |
| `JUMP_OUTSIDE_LOOP` | `EXIT` o `CONTINUE` está escrito fuera de un bucle `FOR`, `WHILE` o `REPEAT`. |
| `UNSUPPORTED_ARGUMENT_TYPE` | A una función estándar se le da un tipo que no acepta en esta versión (un argumento de 64 bits o LREAL donde solo se definen 32 bits, o un WSTRING). |
| `INVALID_INHERITANCE` | Un bloque de función extiende un bloque que no está declarado, que es `FINAL`, o que lo extiende a él. |
| `ABSTRACT_INSTANTIATION` | Se declara una instancia de un bloque de función `ABSTRACT`. |
| `INVALID_OVERRIDE` | Un método se declara `OVERRIDE` sin método base, sobrescribe un método `FINAL`, cambia el tipo de retorno, u oculta un método heredado sin `OVERRIDE`. |
| `INTERFACE_NOT_IMPLEMENTED` | Un bloque de función nombra una interfaz que no implementa por completo, o se asigna a una variable de interfaz un valor que no la implementa. |
| `ACCESS_VIOLATION` | Un método `PRIVATE` o `PROTECTED` se llama desde donde su especificador de acceso no lo permite. |
| `INVALID_THIS_OR_SUPER` | `THIS` o `SUPER^` se usa fuera de un bloque de función o método, o `SUPER^` se usa en un bloque que no extiende ninguno. |
| `INVALID_EXTERNAL_DECLARATION` | Un `VAR_EXTERNAL` no tiene un `VAR_GLOBAL` del mismo nombre, o declara un tipo distinto al de la global. |
| `WORK_MEMORY_EXCEEDED` | Las variables del proyecto necesitan más memoria WORK de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores. |
| `RETAIN_MEMORY_EXCEEDED` | Las variables `RETAIN` del proyecto necesitan más memoria retentiva de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores. |
| `CODE_MEMORY_EXCEEDED` | El programa generado es mayor que la memoria de código del perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores. |
| `INVALID_MEMORY_PROFILE` | El perfil de memoria del destino dado al compilador no es válido: una capacidad que no es un entero positivo o que excede lo que direcciona la máquina virtual. |
| `ADDRESS_OUT_OF_REGION` | Una variable ubicada queda fuera del área de entradas, salidas o memoria que nombra. |
| `ADDRESS_OVERLAP` | Una variable ubicada `%M` se superpone con el almacenamiento de otra variable, con la bandera de inicialización o con el depósito de cadenas. |
| `INVALID_LOCATED_VARIABLE` | Una variable ubicada tiene un tamaño o un tipo que su dirección no permite, como una dirección de bit en una variable que no es BOOL. |
| `INVALID_TAG` | Una etiqueta de comunicación en una variable nombra un tipo o una región que la etiqueta no puede usar, o una dirección Modbus fuera de 0 a 65535. |
| `STACK_DEPTH_EXCEEDED` | Una tarea necesita una pila de evaluación o un anidamiento de llamadas más profundos de lo que el destino admite, o su profundidad no se puede determinar. |
| `MULTIPLE_PROGRAMS_IN_SOURCE` | Un archivo fuente declara más de un `PROGRAM`; cada programa tiene su propio archivo. |
| `INVALID_TASK_CONFIGURATION` | Las tareas de `zplc.json` no son válidas: ninguna, demasiadas, un disparador no soportado, un intervalo o una prioridad fuera de rango, o una tarea que no referencia exactamente un programa. |
| `UNKNOWN_TASK_PROGRAM` | Una tarea nombra un programa que no está entre las fuentes del proyecto. |
| `OUTPUT_OWNERSHIP_CONFLICT` | Dos programas escriben la misma salida física. |
| `INVALID_SAFE_VALUE` | Los valores seguros que el proyecto declara para sus salidas no se pueden cargar: más de los que admite el cargador, un desplazamiento fuera de la imagen de salidas, un bit mayor que 7, un valor que no es 0 ni 1, o la misma salida dos veces. |
| `INTERNAL_COMPILER_ERROR` | El compilador se detuvo ante una condición que no esperaba; el mensaje la nombra. Nunca es un error del programa: repórtelo con la fuente. |
| `NO_BOARD_CHANNEL` | Una variable ubicada está en una dirección donde la placa del proyecto no tiene canal; el mensaje nombra la variable, la dirección y la placa. |
| `TRANSLATION_FAILED` | Una fuente de escalera, diagrama de bloques de función, diagrama funcional secuencial o lista de instrucciones no se puede traducir a Texto Estructurado; el mensaje nombra el elemento. |

### Ensamblado del código

| Código | Qué significa |
| --- | --- |
| `ASSEMBLER_ERROR` | El ensamblador rechazó el código generado, por ejemplo un operando o una dirección reubicada que no cabe en su campo. Es un defecto del compilador cuando la fuente es válida. |

## Ejemplos

Cada ejemplo es un programa que el compilador rechaza con ese código; la posición y el mensaje son los que informa su compilación, y una prueba del compilador compila cada uno.

### UNEXPECTED_CHARACTER

Un carácter que no es parte del lenguaje aparece fuera de un comentario o de una cadena.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1 @ 2;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:10`. Mensaje: `Compilation of 'Main' failed: Unexpected character: '@'`

### UNTERMINATED_COMMENT

Un comentario se abre y nunca se cierra.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  (* never closed
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:3`. Mensaje: `Compilation of 'Main' failed: Unterminated comment: the comment opened by (* is never closed with *)`

### UNTERMINATED_STRING_LITERAL

Un literal STRING o WSTRING no se cierra antes del fin de la línea.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING;
END_VAR
  S := 'open;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `Compilation of 'Main' failed: Unterminated string literal (newline in string)`

### INVALID_NUMBER_LITERAL

Un número está escrito en una forma que el lenguaje no define: un separador de dígitos mal ubicado, una base que no es 2, 8 ni 16, un dígito que no es válido en su base, o un prefijo de base sin dígitos.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 3#12;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Compilation of 'Main' failed: The number base 3# is not supported: use 2#, 8# or 16#`

### INVALID_TYPED_LITERAL

Un literal tipado como `INT#5` nombra un tipo desconocido, no tiene valor, tiene un valor que no pertenece al tipo (una fracción en un entero, `BOOL#2`) o un valor fuera del rango del tipo.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := INT#1.5;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Compilation of 'Main' failed: INT#1.5: an integer literal has no fraction or exponent`

### UNEXPECTED_TOKEN

La gramática no permite la palabra o el símbolo que está escrito aquí; el mensaje dice qué se esperaba.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := ;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Compilation of 'Main' failed: Expected expression, got SEMICOLON`

### UNSUPPORTED_CONSTRUCT

Una construcción de IEC 61131-3 que esta versión no implementa (un espacio de nombres, un puntero, una propiedad, una configuración textual, una forma de llamada) se rechaza por su nombre en lugar de compilarse mal.

```text
NAMESPACE Plant
END_NAMESPACE
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `1:1`. Mensaje: `Compilation of 'Main' failed: NAMESPACE ... END_NAMESPACE is not supported`

### INVALID_ARRAY_DECLARATION

Una declaración de arreglo no es válida: más de tres dimensiones, un límite que no es una constante entera, o un límite superior menor que el inferior.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[5..1] OF INT;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:17`. Mensaje: `Compilation of 'Main' failed: Invalid array bounds: 5..1 (upper must be >= lower)`

### CIRCULAR_TYPE_ALIAS

Un alias de tipo se refiere a sí mismo, directa o indirectamente a través de otros alias.

```text
TYPE A : B; B : A; END_TYPE
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `1:1`. Mensaje: `Compilation of 'Main' failed: The type alias 'A' refers to itself`

### INVALID_STRING_CAPACITY

La capacidad de un STRING o WSTRING no es una constante entera de 1 o más.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING[0];
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:14`. Mensaje: `Compilation of 'Main' failed: The capacity of STRING must be an integer constant of 1 or more`

### INVALID_TIME_LITERAL

Un literal TIME, DATE, TIME_OF_DAY o DATE_AND_TIME está mal formado, es más fino de lo que TIME puede representar (1 ms), o está fuera del rango de su tipo.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  T : TIME;
END_VAR
  T := T#5x;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `Compilation of 'Main' failed: Invalid time literal: 5x`

### INVALID_DIRECT_ADDRESS

Una variable ubicada (`AT %IX0.0`) tiene una dirección que no sigue la forma `%` área, tamaño, byte y bit.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Q AT %IW : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:8`. Mensaje: `Compilation of 'Main' failed: Invalid I/O address: %IW`

### INVALID_BIT_ACCESS

Un acceso a bit como `w.3` nombra un bit que el tipo no tiene, o no está escrito como un número decimal.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  B := X.20;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Bit 20 is out of range for INT: it has bits 0 to 15`

### INVALID_ENUMERATION

El valor de un miembro de una enumeración no es un literal entero.

```text
TYPE Color : (Red := X, Green); END_TYPE
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `1:23`. Mensaje: `Compilation of 'Main' failed: Enum value must be an integer literal`

### INVALID_FUNCTION_RETURN_TYPE

Una función devuelve un tipo que una función no puede devolver: un arreglo, una estructura o un bloque de función.

```text
FUNCTION F : ARRAY[0..3] OF INT
END_FUNCTION
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `2:1`. Mensaje: `Compilation of 'Main' failed: Function return type must be an elementary type, not ARRAY`

### INVALID_OUTPUT_BINDING

El enlace de salida `=>` no se usa como el lenguaje lo define: debe nombrar la variable que recibe la salida, y solo la llamada a un bloque de función tiene enlaces de salida.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Tmr : TON;
END_VAR
  X := 1;
  Tmr(IN := B, PT := T#1s, Q => 5);
END_PROGRAM
```

Se informa en: `src/Main.st` `8:33`. Mensaje: `Compilation of 'Main' failed: An output binding names the variable that receives 'Q'`

### UNKNOWN_IDENTIFIER

Se usa un nombre que ninguna declaración en alcance introduce.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := Missing;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Unknown identifier 'Missing'`

### UNKNOWN_MEMBER

Se lee o escribe un miembro que la estructura o el bloque de función no tiene.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Tmr : TON;
END_VAR
  Tmr(IN := B, PT := T#1s);
  B := Tmr.Nope;
END_PROGRAM
```

Se informa en: `src/Main.st` `8:8`. Mensaje: `Unknown member 'Nope' on FB 'TON'`

### UNKNOWN_TYPE

Se nombra un tipo de dato, una enumeración, un tipo de bloque de función o una interfaz que no está declarado.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : Widget;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:7`. Mensaje: `Unknown type 'Widget' in the declaration of 'Y'`

### UNKNOWN_FUNCTION

Una llamada nombra una función o una instancia de bloque de función que no está declarada.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := NoSuchFunction(1);
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Unknown function 'NoSuchFunction'`

### UNKNOWN_METHOD

Se llama a un método que el bloque de función, o la interfaz de la variable, no tiene.

```text
FUNCTION_BLOCK Fb
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  I : Fb;
END_VAR
  I.Missing();
END_PROGRAM
```

Se informa en: `src/Main.st` `7:3`. Mensaje: `Unknown method 'Missing' on FB 'Fb'`

### UNKNOWN_PARAMETER

Una llamada nombra un argumento que la función, el bloque de función o el método no tiene.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice(W := 1);
END_PROGRAM
```

Se informa en: `src/Main.st` `11:14`. Mensaje: `Function 'Twice' has no input parameter 'W'`

### MISSING_ARGUMENT

Una llamada a una función omite un parámetro que no tiene valor por defecto.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice();
END_PROGRAM
```

Se informa en: `src/Main.st` `11:8`. Mensaje: `Function 'Twice' is called without its parameter 'V'`

### INVALID_ARGUMENTS

Los argumentos de una llamada no corresponden con su declaración: un parámetro dado dos veces, un argumento posicional después de uno con nombre, o una cantidad incorrecta de argumentos.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := Twice(V := 1, V := 2);
END_PROGRAM
```

Se informa en: `src/Main.st` `11:22`. Mensaje: `Parameter 'V' of function 'Twice' is given twice`

### RECURSIVE_CALL

Una función o un bloque de función se llama a sí mismo, directa o indirectamente; el lenguaje no tiene recursión.

```text
FUNCTION F : INT
VAR_INPUT
  V : INT;
END_VAR
  F := F(V := V);
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := F(V := 1);
END_PROGRAM
```

Se informa en: `src/Main.st` `5:8`. Mensaje: `Function 'F' calls itself: a function cannot be recursive`

### DUPLICATE_DECLARATION

Un nombre se declara dos veces en el mismo alcance, o una función, un bloque de función, un tipo o una global se declara en dos archivos del proyecto.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  X : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:3`. Mensaje: `Symbol 'X' already defined`

### TYPE_MISMATCH

Un valor de un tipo se usa donde se requiere otro: una asignación, un operando, una condición, un argumento o un valor inicial.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  B := X;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Type mismatch: a value of type INT cannot be used where BOOL is expected. IEC 61131-3 converts implicitly only to a wider type of the same kind; convert it explicitly, for example with INT_TO_BOOL`

### NARROWING_NOT_ALLOWED

Un valor se guarda en un tipo más estrecho y el proyecto convierte el estrechamiento implícito en un error (`compiler.strictTypes`).

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : SINT;
END_VAR
  Y := X;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `Implicit narrowing from INT to SINT: a value that does not fit keeps only its low 8 bits; use an explicit conversion if that is intended. This is an error because compiler.strictTypes is on`

### CONSTANT_OUT_OF_RANGE

Una constante no cabe en el tipo en que se guarda o con el que se compara, o un literal entero no cabe en 32 bits.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Y : SINT;
END_VAR
  Y := 300;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `The constant 300 does not fit SINT (-128 to 127)`

### STRING_TOO_LONG

Un literal de cadena tiene más caracteres que la capacidad de la variable que inicializa o a la que se asigna.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  S : STRING[4];
END_VAR
  S := 'much too long';
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `String literal of 13 characters does not fit 'S' (STRING[4] holds 4)`

### ASSIGNMENT_TO_CONSTANT

Una constante recibe una asignación, se enlaza a una salida, se pasa como parámetro de entrada y salida o se referencia para escribirla.

```text
PROGRAM Main
VAR CONSTANT
  K : INT := 1;
END_VAR
  K := 2;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:3`. Mensaje: `Cannot assign to constant 'K'`

### INVALID_INITIALISER

Un valor inicial no corresponde con la declaración: la forma incorrecta para el tipo, demasiados valores, o un miembro desconocido en el inicializador de una estructura.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[0..1] OF INT := [1, 2, 3];
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:29`. Mensaje: `Too many initial values for 'A': 3 given, it has 2 elements`

### INVALID_ARRAY_ACCESS

Se aplica un índice a algo que no es un arreglo, con una cantidad incorrecta de índices, o con un índice que no es un entero de 32 bits.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := X[1];
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `'X' is not an array`

### INDEX_OUT_OF_BOUNDS

Un índice constante queda fuera de los límites del arreglo.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A : ARRAY[0..3] OF INT;
END_VAR
  X := A[9];
END_PROGRAM
```

Se informa en: `src/Main.st` `7:10`. Mensaje: `Array index 9 is outside the bounds 0..3 of 'A'`

### INVALID_MEMBER_ACCESS

Se accede a un miembro de algo que no tiene miembros, o se usa una estructura o un bloque de función completos donde se requiere un valor.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := X.field;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:8`. Mensaje: `Cannot access member 'field' of 'X': type 'INT' has no members`

### INVALID_REFERENCE

Una referencia se crea o se sigue de una manera no permitida: desreferenciar algo que no es una variable `REF_TO`, asignarle un valor que no es una referencia, o referenciar una constante.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  P : INT;
END_VAR
  X := P^;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:8`. Mensaje: `'P' is not a reference: only a REF_TO variable can be dereferenced`

### INVALID_CASE_LABEL

Una etiqueta de `CASE` no es una constante entera, un rango está vacío, la etiqueta no cabe en el selector, o el selector no es un entero ni una enumeración.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  CASE X OF
    X: B := TRUE;
  END_CASE;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:5`. Mensaje: `'X' is not an integer constant`

### OVERLAPPING_CASE_LABELS

Dos etiquetas del mismo `CASE` seleccionan el mismo valor.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  CASE X OF
    1..5: B := TRUE;
    3: B := FALSE;
  END_CASE;
END_PROGRAM
```

Se informa en: `src/Main.st` `8:5`. Mensaje: `CASE label 3 overlaps an earlier label`

### INVALID_FOR_COUNTER

El contador de un bucle `FOR` no es una variable entera declarada.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  R : LREAL;
END_VAR
  FOR R := 1 TO 3 DO
    X := X + 1;
  END_FOR;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:3`. Mensaje: `A FOR counter must be an integer variable, not LREAL`

### JUMP_OUTSIDE_LOOP

`EXIT` o `CONTINUE` está escrito fuera de un bucle `FOR`, `WHILE` o `REPEAT`.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  EXIT;
END_PROGRAM
```

Se informa en: `src/Main.st` `6:3`. Mensaje: `EXIT outside of loop`

### UNSUPPORTED_ARGUMENT_TYPE

A una función estándar se le da un tipo que no acepta en esta versión (un argumento de 64 bits o LREAL donde solo se definen 32 bits, o un WSTRING).

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  WS : WSTRING;
  S : STRING;
END_VAR
  S := LEFT(WS, 2);
END_PROGRAM
```

Se informa en: `src/Main.st` `8:13`. Mensaje: `LEFT does not take a WSTRING yet: only LEN, assignment and initial values do`

### INVALID_INHERITANCE

Un bloque de función extiende un bloque que no está declarado, que es `FINAL`, o que lo extiende a él.

```text
FUNCTION_BLOCK Child EXTENDS Missing
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `1:1`. Mensaje: `Circular inheritance or missing base FB in definitions: Child (extends Missing)`

### ABSTRACT_INSTANTIATION

Se declara una instancia de un bloque de función `ABSTRACT`.

```text
FUNCTION_BLOCK ABSTRACT Base
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  B : Base;
END_VAR
END_PROGRAM
```

Se informa en: `src/Main.st` `5:3`. Mensaje: `'B' is an instance of the ABSTRACT function block 'Base'`

### INVALID_OVERRIDE

Un método se declara `OVERRIDE` sin método base, sobrescribe un método `FINAL`, cambia el tipo de retorno, u oculta un método heredado sin `OVERRIDE`.

```text
FUNCTION_BLOCK Base
END_FUNCTION_BLOCK
FUNCTION_BLOCK Child EXTENDS Base
  METHOD OVERRIDE Run : BOOL
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `4:3`. Mensaje: `Method 'Run' marked as OVERRIDE but no base method found in 'Child'`

### INTERFACE_NOT_IMPLEMENTED

Un bloque de función nombra una interfaz que no implementa por completo, o se asigna a una variable de interfaz un valor que no la implementa.

```text
INTERFACE IRun
  METHOD Run : BOOL
  END_METHOD
END_INTERFACE
FUNCTION_BLOCK Fb IMPLEMENTS IRun
END_FUNCTION_BLOCK
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `5:1`. Mensaje: `Function Block 'Fb' implements interface 'IRun' but is missing required method 'Run'`

### ACCESS_VIOLATION

Un método `PRIVATE` o `PROTECTED` se llama desde donde su especificador de acceso no lo permite.

```text
FUNCTION_BLOCK Fb
  METHOD PRIVATE Hidden : BOOL
    Hidden := TRUE;
  END_METHOD
END_FUNCTION_BLOCK
PROGRAM Main
VAR
  I : Fb;
  B : BOOL;
END_VAR
  B := I.Hidden();
END_PROGRAM
```

Se informa en: `src/Main.st` `11:8`. Mensaje: `The method 'Hidden' of 'Fb' is PRIVATE: it can be called only inside 'Fb'`

### INVALID_THIS_OR_SUPER

`THIS` o `SUPER^` se usa fuera de un bloque de función o método, o `SUPER^` se usa en un bloque que no extiende ninguno.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  SUPER^();
END_PROGRAM
```

Se informa en: `src/Main.st` `6:3`. Mensaje: `SUPER^ is used outside of a function block`

### INVALID_EXTERNAL_DECLARATION

Un `VAR_EXTERNAL` no tiene un `VAR_GLOBAL` del mismo nombre, o declara un tipo distinto al de la global.

```text
PROGRAM Main
VAR_EXTERNAL
  Nowhere : INT;
END_VAR
END_PROGRAM
```

Se informa en: `src/Main.st` `3:3`. Mensaje: `VAR_EXTERNAL 'Nowhere' has no VAR_GLOBAL declaration`

### WORK_MEMORY_EXCEEDED

Las variables del proyecto necesitan más memoria WORK de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.

```text
PROGRAM Main
VAR
  Table : ARRAY[0..8999] OF BYTE;
  Gain : REAL;
END_VAR
  Gain := 1.5;
END_PROGRAM
```

Se informa en: `src/Main.st` `3:1`. Mensaje: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (the WORK memory of the target profile, one byte of it the initialization flag). Largest consumers: Main.Table (9000 bytes), Main.Gain (4 bytes)`

### RETAIN_MEMORY_EXCEEDED

Las variables `RETAIN` del proyecto necesitan más memoria retentiva de la que tiene el perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.

```text
PROGRAM Main
VAR RETAIN
  Log : ARRAY[0..5000] OF BYTE;
  Count : DINT;
END_VAR
  Count := Count + 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `3:1`. Mensaje: `RETAIN allocation exceeds the target memory profile: 5012 bytes required, 4096 bytes available (the retentive memory of the target profile). Largest consumers: Main.Log (5001 bytes), Main.Count (4 bytes)`

### CODE_MEMORY_EXCEEDED

El programa generado es mayor que la memoria de código del perfil del destino. El mensaje indica los bytes requeridos, los bytes disponibles y los mayores consumidores.

```text
FUNCTION Twice : INT
VAR_INPUT
  V : INT;
END_VAR
  Twice := V * 2;
END_FUNCTION
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := Twice(V := X);
  X := X + 1;
  X := X * 2;
  X := X - 3;
END_PROGRAM
```

Se informa en: `src/Main.st` `7:1`. Mensaje: `CODE exceeds the target memory profile: 81 bytes required, 40 bytes available (the code memory of the target profile). Largest consumers: Program Main (53 bytes), Function Twice (25 bytes)`

### INVALID_MEMORY_PROFILE

El perfil de memoria del destino dado al compilador no es válido: una capacidad que no es un entero positivo o que excede lo que direcciona la máquina virtual.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `zplc.json` `1:1`. Mensaje: `Invalid target memory profile`

### ADDRESS_OUT_OF_REGION

Una variable ubicada queda fuera del área de entradas, salidas o memoria que nombra.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Big AT %MB9000000 : BYTE;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:1`. Mensaje: `WORK allocation exceeds its memory region`

### ADDRESS_OVERLAP

Una variable ubicada `%M` se superpone con el almacenamiento de otra variable, con la bandera de inicialización o con el depósito de cadenas.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  A AT %MW0 : INT;
  B2 AT %MB1 : BYTE;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:1`. Mensaje: `automatic WORK symbol collides with located %M symbol`

### INVALID_LOCATED_VARIABLE

Una variable ubicada tiene un tamaño o un tipo que su dirección no permite, como una dirección de bit en una variable que no es BOOL.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  Q AT %QX0.1 : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:1`. Mensaje: `Bit-addressed locations require BOOL values`

### INVALID_TAG

Una etiqueta de comunicación en una variable nombra un tipo o una región que la etiqueta no puede usar, o una dirección Modbus fuera de 0 a 65535.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
  T : DINT {publish};
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `src/Main.st` `5:1`. Mensaje: `PUBLISH tag on 'T' does not support DINT`

### STACK_DEPTH_EXCEEDED

Una tarea necesita una pila de evaluación o un anidamiento de llamadas más profundos de lo que el destino admite, o su profundidad no se puede determinar.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 13 + (12 + (11 + (10 + (9 + (8 + (7 + (6 + (5 + (4 + (3 + (2 + (1))))))))))));
END_PROGRAM
```

Se informa en: `src/Main.st` `1:1`. Mensaje: `Task 'Main' needs an evaluation stack of 13 values and the target holds 8: split the largest expression, or move part of the program into a function`

### NO_PROGRAM

Un archivo fuente de un programa no tiene `PROGRAM`.

```text
FUNCTION F : INT
END_FUNCTION
```

Se informa en: `src/Main.st` `1:1`. Mensaje: `No program found in source`

### MULTIPLE_PROGRAMS_IN_SOURCE

Un archivo fuente declara más de un `PROGRAM`; cada programa tiene su propio archivo.

```text
PROGRAM A
END_PROGRAM
PROGRAM Main
END_PROGRAM
```

Se informa en: `src/Main.st` `3:1`. Mensaje: `Exactly one PROGRAM is required per source unit`

### INVALID_TASK_CONFIGURATION

Las tareas de `zplc.json` no son válidas: ninguna, demasiadas, un disparador no soportado, un intervalo o una prioridad fuera de rango, o una tarea que no referencia exactamente un programa.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `zplc.json` `1:1`. Mensaje: `Task 'Main' has invalid interval`

### UNKNOWN_TASK_PROGRAM

Una tarea nombra un programa que no está entre las fuentes del proyecto.

```text
PROGRAM Main
VAR
  X : INT;
  B : BOOL;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `zplc.json` `1:1`. Mensaje: `Program 'Nope' referenced by task but not found in sources`

### OUTPUT_OWNERSHIP_CONFLICT

Dos programas escriben la misma salida física.

```text
(* src/Main.st *)
PROGRAM Main
VAR
  Out AT %QX0.0 : BOOL;
END_VAR
  Out := TRUE;
END_PROGRAM
```

```text
(* src/Other.st *)
PROGRAM Other
VAR
  Out AT %QX0.0 : BOOL;
END_VAR
  Out := FALSE;
END_PROGRAM
```

Se informa en: `src/Other.st` `3:1`. Mensaje: `Physical output 'Other.Out' (src/Other.st) overlaps 'Main.Out' (src/Main.st)`

### INVALID_SAFE_VALUE

Los valores seguros que el proyecto declara para sus salidas no se pueden cargar: más de los que admite el cargador, un desplazamiento fuera de la imagen de salidas, un bit mayor que 7, un valor que no es 0 ni 1, o la misma salida dos veces.

```text
PROGRAM Main
VAR
  X : INT;
END_VAR
  X := 1;
END_PROGRAM
```

Se informa en: `zplc.json` `1:1`. Mensaje: `Safe value 1 declares output byte 0 bit 3 twice`

### ASSEMBLER_ERROR

El ensamblador rechazó el código generado, por ejemplo un operando o una dirección reubicada que no cabe en su campo. Es un defecto del compilador cuando la fuente es válida.

Ningún programa provoca este código: es para un defecto del compilador, o para un error de una parte que no es el compilador (los traductores de los lenguajes visuales, la admisión de las variables ubicadas contra una placa).

### INTERNAL_COMPILER_ERROR

El compilador se detuvo ante una condición que no esperaba; el mensaje la nombra. Nunca es un error del programa: repórtelo con la fuente.

Ningún programa provoca este código: es para un defecto del compilador, o para un error de una parte que no es el compilador (los traductores de los lenguajes visuales, la admisión de las variables ubicadas contra una placa).

### NO_BOARD_CHANNEL

Una variable ubicada está en una dirección donde la placa del proyecto no tiene canal; el mensaje nombra la variable, la dirección y la placa.

Ningún programa provoca este código: es para un defecto del compilador, o para un error de una parte que no es el compilador (los traductores de los lenguajes visuales, la admisión de las variables ubicadas contra una placa).

### TRANSLATION_FAILED

Una fuente de escalera, diagrama de bloques de función, diagrama funcional secuencial o lista de instrucciones no se puede traducir a Texto Estructurado; el mensaje nombra el elemento.

Ningún programa provoca este código: es para un defecto del compilador, o para un error de una parte que no es el compilador (los traductores de los lenguajes visuales, la admisión de las variables ubicadas contra una placa).

{/* <<< END GENERATED: reference/diagnostic-codes <<< */}

Esta página se genera: para cambiarla, se cambia su fuente y se ejecuta `bun run docs:generate`.
