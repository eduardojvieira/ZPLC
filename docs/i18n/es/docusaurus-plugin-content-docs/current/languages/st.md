---
sidebar_position: 1
---

# Structured Text (ST)

Structured Text (ST) es la base semántica canónica de ZPLC.

## Papel en ZPLC 2.0

- `ST` es la entrada directa al backend compartido del compilador
- `IL`, `LD`, `FBD` y `SFC` son rutas cuando sus contratos de editor, transpilador y compilador las aceptan
- el runtime sigue ejecutando `.zplc`, no código fuente específico de lenguaje

La [suite histórica de lenguajes](./examples/v1-5-language-suite.md) es evidencia de compatibilidad; no prueba paridad universal, tiempos en la placa, hardware ni HIL.

## Por qué ST importa arquitectónicamente

`packages/zplc-ide/src/compiler/index.ts` trata a ST distinto del resto:

- `ST` evita la etapa de transpilation
- los demás lenguajes se normalizan a ST antes de compilar

Por eso ST es el mejor lugar para entender la semántica pública de automatización que el runtime debería ejecutar.

## Uso típico en ZPLC

ST es la opción natural para:

- lógica de control en texto
- aritmética y manipulación de datos
- llamar directamente a funciones y bloques de función de la stdlib
- cuerpos de acción que provienen de flujos visuales de más alto nivel

## Ejemplo canónico mínimo

```st
PROGRAM WorkflowST
VAR
    Start : BOOL := TRUE;
    Timer : TON;
    Out1 : BOOL := FALSE;
END_VAR
Timer(IN := Start, PT := T#250ms);
Out1 := Timer.Q;
END_PROGRAM
```

## Superficies ST visibles hoy en el repo

El compilador y la stdlib muestran uso de ST con:

- cuerpos de programa y variables
- temporizadores como `TON`, `TOF`, `TP`
- contadores como `CTU`, `CTD`, `CTUD`
- funciones de string como `LEN`, `CONCAT`, `LEFT`, `RIGHT`, `MID`
- llamadas a FBs de comunicación cuando el contrato compiler/runtime los respalda

## Tipos numéricos

El caso que figura junto a una fila o una regla es un programa de conformidad de `conformance/cmp/` que se ejecuta en el runtime nativo. Un caso marcado «falla hoy» está en la lista de fallos esperados de `tools/ci/expected-failures.json`.

| Tipo | Bits | Rango | Se ordena como | Caso de conformidad |
|---|---|---|---|---|
| `BOOL` | 8 | `FALSE`, `TRUE` | sin orden | `harness/vf-001-bool-output-toggles` |
| `SINT` | 8 | -128 a 127 | con signo | `cmp-011-sint-limits` |
| `USINT` | 8 | 0 a 255 | sin signo | `cmp-012-usint-holds-0-to-255` |
| `BYTE` | 8 | cadena de bits, 0 a 255 | sin signo | `cmp-014-not-byte` |
| `INT` | 16 | -32768 a 32767 | con signo | `cmp-011-int-limits` |
| `UINT` | 16 | 0 a 65535 | sin signo | `cmp-012-uint-65535` |
| `WORD` | 16 | cadena de bits, 0 a 65535 | sin signo | `cmp-014-not-word` |
| `DINT` | 32 | -2147483648 a 2147483647 | con signo | `cmp-011-dint-limits` |
| `UDINT` | 32 | 0 a 4294967295 | sin signo | `cmp-012-udint-max` |
| `DWORD` | 32 | cadena de bits, 0 a 4294967295 | sin signo | `cmp-014-not-dword` |
| `LINT` | 64 | -9223372036854775808 a 9223372036854775807 | con signo | `cmp-015-lint-extreme-values` |
| `ULINT` | 64 | 0 a 18446744073709551615 | sin signo | `cmp-015-ulint-compares-unsigned` |
| `LWORD` | 64 | cadena de bits, 0 a 18446744073709551615 | sin signo | `cmp-015-ulint-compares-unsigned` |
| `REAL` | 32 | IEEE 754 de precisión simple | orden IEEE, NaN sin orden | `cmp-013-real-nan-is-unordered` |
| `LREAL` | 64 | IEEE 754 de precisión doble, solo declaración | no soportado | `cmp-015-lreal-double-precision` (falla hoy) |

### Aritmética, desbordamiento y división

- **Ancho de un cálculo.** Los operandos de 8 y 16 bits se amplían a 32 bits para la operación, y el resultado se recorta a su ancho solo cuando se guarda. Con `i : INT := 32767`, `i + 1` vale 32768 dentro de una expresión y -32768 una vez guardado en un `INT`; `UINT` 65535 más 1 guardado en un `UINT` es 0 (`cmp-012-uint-65535`), y `SINT`, `USINT` y `BYTE` se comportan igual.
- **32 y 64 bits dan la vuelta en complemento a dos.** `DINT` 2147483647 más 1 es -2147483648, y la resta y la multiplicación dan la vuelta del mismo modo. El `DINT` más negativo, negado, pasado a `ABS` o dividido por -1, sigue siendo el `DINT` más negativo, y ese valor `MOD` -1 es 0 (`cmp-016-dint-add-wraps`, `cmp-016-dint-sub-wraps`, `cmp-016-dint-mul-wraps`, `cmp-016-dint-negate-min`, `cmp-016-dint-abs-min`, `cmp-016-dint-min-divided-by-minus-one`, `cmp-016-dint-min-modulo-minus-one`). La suma de `LINT` da la vuelta del mismo modo (`cmp-015-lint-extreme-values`).
- **La división trunca hacia cero y `MOD` toma el signo del dividendo.** -8 / 2 es -4 (`cmp-011-int-divide-negative`) y -7 / 2 es -3, con -7 `MOD` 2 igual a -1, como en C. La división y el `MOD` de `UDINT` son sin signo en todo el rango (`cmp-012-udint-divide-and-modulo`).
- **Una división o un `MOD` por cero termina el scan con la falla de VM `ZPLC_VM_DIV_BY_ZERO` (código 0x03).** Lo mismo ocurre con una división de `REAL` por cero. Las pruebas de la VM son `test_vm_arith_edges.c` y `test_vm_core.c` en `firmware/lib/zplc_core/tests/`; para saber qué hace una falla con las salidas, vea [Pausa, reanudación, paso y parada](../runtime/scheduler.md#pausa-reanudación-paso-y-parada).

### Desplazamientos, rotaciones y lógica de bits

- `SHL(IN, N)`, `SHR(IN, N)`, `ROL(IN, N)` y `ROR(IN, N)` son funciones. Un desplazamiento de 32 o más, o con una cuenta negativa, da 0 (`cmp-016-shift-by-the-width-or-more`). `SHR` es lógico: entran ceros por la izquierda.
- Un `BYTE`, un `WORD` y los tipos enteros de 8 y 16 bits se desplazan y rotan dentro de su propio ancho: `SHL` descarta los bits desplazados más allá del bit 7 o del bit 15 (`cmp-014-shl-byte-keeps-8-bits`), y `ROL` y `ROR` dan la vuelta dentro de 8 o 16 bits (`cmp-014-rol-byte-rotates-within-8-bits`, `cmp-014-ror-word-rotates-within-16-bits`).
- `AND`, `OR`, `XOR` y `NOT` trabajan con todo el ancho declarado (`cmp-014-not-byte`, `cmp-014-not-word`, `cmp-014-not-dword`, `cmp-014-and-or-xor-word`), y con 64 bits en `LWORD` (`cmp-015-ulint-compares-unsigned`).

### Conversiones

- **Ampliar conserva el valor.** Un tipo con signo se extiende con signo y un tipo sin signo o una cadena de bits se extiende con ceros: `INT` -5 pasa a `DINT` -5 (`cmp-011-int-widens-to-dint`), `UINT` 65535 pasa a `UDINT` 65535 (`cmp-012-uint-65535`), y un `LINT` toma un `DINT` con su signo y un `UDINT` sin él (`cmp-015-lint-widens-and-narrows`).
- **Reducir al asignar conserva los bits bajos, y la compilación avisa.** Un `LINT` 5000000000 guardado en un `DINT` es 705032704 (`cmp-015-lint-widens-and-narrows`), y un `DINT` 70000 guardado en un `INT` es 4464 (`cmp-005-integer-narrowing-keeps-the-low-bits-and-warns`). La compilación termina bien e informa la advertencia `IMPLICIT_NARROWING` en el valor, con el nombre de los dos tipos; Studio, la CLI (`Warning:`) y la API de herramientas la muestran. Una constante se controla en cambio (una constante que no cabe es un error, CMP-018), y `x AND máscara` o `x MOD n` con una máscara o un divisor que cabe en el destino no avisa (`cmp-005-widening-masks-and-constants-do-not-warn`). Aplique una máscara al valor o declare el destino con ancho suficiente para quitar la advertencia.
- **Un entero se convierte a `REAL`** cuando se asigna a uno o se mezcla con uno: `INT` por `REAL` es un `REAL` (`cmp-013-int-times-real`, `cmp-013-real-assigned-from-integer`).
- **Lo inverso es un error.** `i := r` con un `REAL` `r`, y una expresión entera asignada a un `BOOL`, son errores de compilación que nombran los dos tipos (`cmp-005-int-assigned-from-real`, `cmp-005-bool-assigned-from-int`). Escriba `REAL_TO_INT(r)` e `i <> 0` en su lugar.
- **`REAL_TO_INT` redondea al entero más cercano**, una mitad exacta al entero par, satura en los límites del tipo de destino y da 0 para un NaN (`cmp-057-real-to-int-rounds`, `cmp-057-real-to-int-ties-go-to-even`, `cmp-057-real-to-integer-saturates-at-the-destination-range`, `cmp-016-real-nan-to-dint`); `REAL_TO_DINT` es la forma de 32 bits (`cmp-016-real-out-of-range-to-dint`) y `REAL_TO_DINT(TRUNC(x))` trunca hacia cero (`cmp-016-real-to-dint-truncates-toward-zero`). `TRUNC` y `ROUND` devuelven un `REAL` (`cmp-057-trunc-truncates`, `cmp-057-bool-and-round-conversions`).
- Existe una función de conversión `<ORIGEN>_TO_<DESTINO>` para cada par de tipos distintos entre `BOOL`, `SINT`, `USINT`, `BYTE`, `INT`, `UINT`, `WORD`, `DINT`, `UDINT`, `DWORD`, `REAL` y `TIME` (CMP-057, `cmp-057-integer-conversion-functions`); un entero que no cabe conserva sus bits bajos y un `REAL` fuera del destino satura. Los tipos de 64 bits y `DATE`, `TOD` y `DT` todavía no tienen ninguna.

### Operandos mixtos y comparación

- **El tipo de una operación es el del operando más ancho, `REAL` gana sobre todo entero, y entre dos tipos del mismo ancho gana el que no tiene signo** (la regla de C). Por eso `DINT` -1 comparado con `UDINT` 5 es una comparación sin signo y `-1 < 5` es FALSE, mientras que `INT` -1 comparado con `UINT` 5 es TRUE porque ambos se amplían primero a 32 bits. La regla es `commonType` en `packages/zplc-compiler/src/compiler/numeric.ts`, cubierta por `numeric.test.ts`.
- **Los tipos sin signo se comparan sin signo en todo su rango**: `UDINT` 4294967295 es el valor mayor en toda comparación (`cmp-012-udint-max`, `cmp-012-udint-around-2-31`, `cmp-012-udint-compare-unsigned`), y lo mismo `ULINT` (`cmp-015-ulint-compares-unsigned`).
- **`REAL` se compara con el orden de IEEE 754.** -0.0 es igual a 0.0, los infinitos se ordenan más allá de todo valor finito, y un NaN no es igual, menor ni mayor que nada, ni siquiera que sí mismo (`cmp-013-real-negative-zero-equals-zero`, `cmp-013-real-infinities-order`, `cmp-013-real-nan-is-unordered`).

### Tipos de 64 bits

| Sobre `LINT`, `ULINT` o `LWORD` | Hoy | Caso de conformidad |
|---|---|---|
| `+`, `-`, comparación, `AND`, `OR`, `XOR`, `NOT`, negación | Funciona | `cmp-015-lint-add-and-subtract-carry`, `cmp-015-lint-extreme-values`, `cmp-015-ulint-compares-unsigned` |
| `*`, `/`, `MOD`, `SHL`, `SHR`, `ROL`, `ROR`, `ABS` y las demás funciones estándar, conversión desde o hacia `REAL`, un selector de `CASE`, un contador de `FOR` | Error de compilación que nombra CMP-015 | `cmp-015-lint-multiplication-is-refused`; `numeric.test.ts` para el resto |
| Asignación o aritmética de `LREAL` | La compilación termina bien y el cargador rechaza el programa | `cmp-015-lreal-double-precision` (falla hoy) |

El requisito CMP-015 pide todo esto. Hasta entonces, un rechazo en la compilación es el comportamiento previsto; el rechazo del cargador para `LREAL` no lo es.

## Tipos de tiempo y fecha

| Tipo | Ancho | Qué contiene | Literal |
|---|---|---|---|
| `TIME` | 32 bits, sin signo | Una duración en milisegundos, de 0 a 4294967295 (`T#49d17h2m47s295ms`) | `T#1h30m`, `T#1.5s`, `TIME#250ms` |
| `DATE` | 32 bits, con signo | Segundos desde 1970-01-01; las fechas anteriores son negativas | `D#2024-01-01` |
| `TOD` (`TIME_OF_DAY`) | 32 bits, sin signo | Milisegundos desde la medianoche | `TOD#12:30:00` |
| `DT` (`DATE_AND_TIME`) | 64 bits, con signo | Milisegundos desde 1970-01-01 00:00:00 | `DT#2024-01-01-12:00:00` |

### TIME

Este es el comportamiento actual. El signo y el ancho de `TIME` son una decisión abierta del propietario del proyecto, descrita al final de esta lista.

- Un literal tiene días, horas, minutos, segundos y milisegundos, cada uno a lo sumo una vez y en ese orden, con un `_` opcional entre ellos (`T#1d_2h_3m_4s_5ms`). `us` y `ns` se aceptan cuando el literal completo es un número entero de milisegundos (`T#1000us` es 1 ms), y el último componente puede llevar fracción (`T#1h30.5m`, `T#1.5s`).
- Un literal que no es un número entero de milisegundos (`T#1.5ms`), que supera 4294967295 ms (`T#50d`) o que es negativo (`T#-5s`) es un error de compilación que nombra el literal (`cmp-017-time-literal-below-a-millisecond`, `cmp-017-time-literal-above-the-range`, `cmp-017-time-literal-negative`). Las unidades fuera de orden (`T#30m1h`) también se rechazan (`cmp-017-time-literal-units-out-of-order`).
- La comparación, la suma, la resta y la división son de 32 bits sin signo: `T#30d > T#1d` es TRUE y `T#30d + T#10d` es 3456000000 ms. Un preset de temporizador de más de 24,8 días funciona: un `TON` con `PT := T#30d` no termina a los 20 ms.
- Una duración negativa no se puede representar. Una resta por debajo de cero da la vuelta módulo 2^32: `T#0s - T#1s` es 4294966296 ms (`T#49d17h2m46s296ms`), y la compilación no advierte nada. Verifique que el minuendo no sea menor antes de restar.
- El Watch de Studio muestra un `TIME` superior a 2147483647 ms (24d20h31m23s647ms) como un número negativo, porque los adaptadores de watch leen sus 32 bits con signo. El valor que guarda el programa es la cuenta sin signo.
- Si `TIME` sigue siendo una cuenta de 32 bits sin signo o pasa a un valor de 64 bits con signo, que permitiría duraciones negativas y rangos de más de 49 días, es una decisión abierta del propietario que se sigue bajo el requisito CMP-017. Esta página no anuncia ningún cambio.

### DATE, TOD y DT

- `TOD` y `DT` guardan milisegundos, la unidad de `TIME`. `TOD#12:30:00 + T#1h` es 48600000 ms (13:30:00), `TOD#13:00:00 - T#30m` es 12:30:00, y la diferencia de dos valores `DT` es un `TIME`: `DT#2024-01-01-01:00:00 - DT#2024-01-01-00:00:00` es 3600000 ms. Los tres tipos se asignan y se comparan, y `DT` compara a través del límite de la palabra de 32 bits.
- `DATE` cuenta segundos, no milisegundos. Se asigna y se compara (`D#2024-01-01 < D#2025-06-30`), pero `DATE + TIME` suma milisegundos a una cuenta de segundos: no sume un `TIME` a un `DATE`. Ningún caso de conformidad cubre la aritmética sobre `DATE`; su unidad es la que le da el código (`emitDateLiteral` en `packages/zplc-compiler/src/compiler/codegen.ts`). La unidad de `DATE` y el rango de estos tipos forman parte del requisito CMP-017, que no está cerrado.
- Un literal `DT#` se lee en la zona horaria de la máquina que compila, mientras que `D#` y `TOD#` se leen como UTC. El mismo fuente compilado en dos zonas horarias da dos constantes `DT` distintas. Es un defecto, no un diseño, y todavía ningún caso de conformidad lo fija.

### Tipos no soportados

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` y `WCHAR` no forman parte de ZPLC 2.0. La declaración de uno de ellos, como la de cualquier nombre de tipo desconocido, es un error de compilación que nombra el tipo y su posición (`cmp-003-*` en `conformance/cmp/`).

Nivel de evidencia: host. Los casos `cmp-017-*` y `cmp-015-dt-plus-time-and-difference` compilan con el compilador del repositorio y ejecutan el programa en el runtime nativo, y `packages/zplc-compiler/src/compiler/time.test.ts` cubre la gramática de los literales y sus rechazos. La vuelta por debajo de cero, la zona horaria de `DT#` y la visualización en Studio se observaron o se leyeron en el código (`numeric.ts`, `codegen.ts`, `debugAdapter.ts`) y todavía ningún caso las fija.

## Literales, operadores y declaraciones

Estas formas compilan y se ejecutan. Cada punto nombra los casos de conformidad de `conformance/cmp/` que lo fijan, y todos pasan.

- **Literales numéricos.** Literales con base `2#1010`, `8#17` y `16#FF` (`cmp-031-binary-literal`, `cmp-031-octal-literal`, `cmp-031-hexadecimal-literal`), también con signo menos y con separadores de dígitos (`cmp-031-negative-based-literal`, `cmp-031-separator-in-based-literal`); `1_000` (`cmp-031-digit-separator`); y literales con tipo como `INT#5` de los tipos enteros, de cadena de bits, `BOOL` y `REAL` (`cmp-031-typed-literal`, `cmp-031-typed-literals-of-each-kind`). Una base numérica distinta de 2, 8 y 16, y un literal con tipo fuera del rango de su tipo, son errores de compilación (`cmp-031-base-not-supported`, `cmp-031-typed-literal-out-of-range`). La forma anterior `0xFF` sigue compilando y la compilación la informa como la advertencia `NON_IEC_HEX_LITERAL` (`cmp-031-0x-form-still-works`).
- **Operadores.** `&` tiene la precedencia de `AND` (`cmp-032-ampersand-operator`, `cmp-032-ampersand-binds-tighter-than-or`). `**` es la potencia: los operandos enteros se convierten a `REAL`, liga más fuerte que el signo menos y la multiplicación, y un exponente fraccionario tiene una exactitud de alrededor de una parte en cien mil (`cmp-032-exponent-operator`, `cmp-032-power-of-integers`, `cmp-032-power-precedence`, `cmp-032-power-fractional-exponent`). `0.0 ** -1.0` provoca una falla como una división por cero (`cmp-032-power-zero-base-negative-exponent-faults`).
- **Acceso a bits.** `w.0` lee y escribe un bit de un `BYTE`, `WORD`, `INT`, `DWORD` o `LWORD`, de un miembro de estructura y de un elemento de arreglo, y una escritura deja los demás bits como están (`cmp-032-bit-access`, `cmp-032-bit-set-and-clear`, `cmp-032-bit-write-in-each-width`, `cmp-032-bit-of-lword`, `cmp-032-bit-of-member-and-element`). Un número de bit mayor que el ancho del tipo y un bit de un `BOOL` son errores de compilación (`cmp-032-bit-number-out-of-range`, `cmp-032-bit-access-of-bool-rejected`).
- **Comentarios y sentencia vacía.** Comentarios `(* *)` y `/* */`, y un `;` solo, también dentro de `IF` y `CASE` (`cmp-032-block-comment`, `cmp-032-empty-statement`, `cmp-032-empty-statements-inside-blocks`). Un comentario sin cerrar se informa donde se abre (`cmp-009-unterminated-comment-position`).
- **Declaraciones.** `VAR RETAIN`, `VAR NON_RETAIN` y `VAR_GLOBAL RETAIN` (`cmp-029-var-retain-accepted`, `cmp-029-var-non-retain-is-accepted`, `cmp-029-var-global-retain`). Una variable retentiva toma su valor inicial declarado solo cuando la región retentiva no contiene un estado guardado, de modo que una región restaurada conserva sus valores (`packages/zplc-ide/src/cli/retainedInitialValues.test.ts`). Varios nombres en una declaración comparten su valor inicial (`cmp-030-several-names-one-declaration`, `cmp-030-several-names-with-initial-value`). `VAR_EXTERNAL` debe nombrar una global del mismo tipo (`cmp-030-var-external`, `cmp-030-var-external-type-differs`, `cmp-030-var-external-without-global`). `VAR_TEMP` se acepta en un programa y `VAR_OUTPUT` en una función (`cmp-030-var-temp-in-program`, `cmp-030-function-var-output`). Se aceptan un alias de tipo, también de una estructura o de un arreglo, y varios tipos en un bloque `TYPE`, y se rechazan los alias que se refieren entre sí (`cmp-030-type-alias`, `cmp-030-alias-of-array-and-structure`, `cmp-030-several-types-one-block`, `cmp-030-alias-refers-to-itself`).
- **Bloques de función.** Una instancia se puede declarar dentro de un bloque de función, y los arreglos de instancias se llaman con un índice constante o en tiempo de ejecución, cada elemento con su propio estado (`cmp-038-instance-inside-function-block`, `cmp-038-array-of-instances`, `cmp-038-array-of-user-blocks`, `cmp-038-array-run-time-index`). Un índice constante fuera del arreglo es un error de compilación (`cmp-038-constant-index-out-of-bounds`). Los nombres de los bloques de biblioteca no son palabras reservadas: un bloque que declara el programa gana sobre el bloque de biblioteca del mismo nombre (`cmp-033-library-block-name-as-variable`, `cmp-033-user-block-named-like-a-library-block`).
- **Diagnósticos.** Un archivo con varios errores independientes informa cada uno, en orden, sin los falsos errores que dejaba un `IF` roto (`cmp-007-three-errors-three-diagnostics`, `cmp-007-no-error-after-a-broken-if`). Una declaración duplicada y un miembro desconocido se informan en su propia línea (`cmp-006-duplicate-variable-position`, `cmp-006-unknown-member-position`), y se rechaza una llamada que pasa un argumento que ningún `VAR_INPUT` recibe (`cmp-035-unknown-argument-name`).

## Datos, almacenamiento y valores iniciales

Cada regla de abajo está cubierta por un caso de conformidad en `conformance/cmp` (CMP-019 a CMP-028).

### Estructuras, enumeraciones y arreglos

- Un miembro de una estructura o de un bloque de función se lee y se escribe con su ancho declarado (`BYTE` 1 byte, `INT` 2, `DINT` y `REAL` 4, `LINT` 8). Los miembros se anidan a cualquier profundidad: `a.b.c`.
- Una estructura o un arreglo completo se asigna, y se pasa a una función, por valor: se copian todos los bytes, y los dos lados deben ser del mismo tipo.
- Una estructura toma un valor inicial de la forma `(x := 1, y := 2)`. Un campo omitido conserva el valor por defecto de su declaración (`x : INT := 7;` dentro del `TYPE`).
- Una enumeración se guarda como `INT`. Un valor se puede escribir `Tipo#Valor`, que además distingue un nombre de valor que dos enumeraciones comparten.
- Un arreglo tiene de una a tres dimensiones, límites inferiores negativos y límites que son expresiones constantes (`ARRAY[-N .. N * 2] OF INT`). Sus elementos pueden ser de cualquier tipo: una estructura, una cadena, `LINT`. Un valor inicial es una lista `[1, 2, 3]`, listas anidadas para más dimensiones y cuentas de repetición `[100(0)]`.
- Un índice constante fuera de los límites es un error de compilación. Un índice variable fuera de los límites termina el scan con la falla de VM `ZPLC_VM_OUT_OF_BOUNDS` (violación de acceso a memoria). El control está activo por defecto; la opción del compilador `arrayBoundsCheck: false` lo quita.

### Cadenas

- `STRING` tiene 80 caracteres, `STRING[n]` tiene `n`, `WSTRING[n]` tiene `n` caracteres de 16 bits.
- Una asignación copia los caracteres, hasta la capacidad del destino. Un literal más largo que la capacidad de su variable es un error de compilación.
- Una función de cadena nunca modifica sus argumentos: `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE` y `REPLACE` devuelven una cadena nueva. `COPY(src, dst)` y `CLEAR(s)` escriben en su argumento, como dicen sus nombres.
- `s := LEFT(s, n)` (y `RIGHT`, `MID`, `DELETE`, `CONCAT` de la propia variable) trabaja sobre la variable. Cualquier otra función que arma una cadena usa un buffer de la memoria WORK del programa, que cuenta contra los bytes del programa.
- `WSTRING` se puede declarar, inicializar, asignar y medir con `LEN`. Las demás funciones de cadena y la comparación la rechazan con un mensaje.

### Valores iniciales y constantes

- En el primer scan toda variable tiene su valor inicial declarado, o el valor por defecto de su tipo: cero, `FALSE`, la cadena vacía, `NULL`. Eso cubre las variables de un programa, `VAR_GLOBAL`, cada miembro de cada instancia de bloque de función, los campos de estructura y los elementos de arreglo.
- Un local de función y un `VAR_TEMP` de un bloque de función vuelven a tener su valor declarado en cada llamada, de modo que una función no guarda estado. Un `VAR` de un bloque de función conserva su valor de una llamada a otra.
- `VAR CONSTANT` y `VAR_GLOBAL CONSTANT` conservan su valor, y asignar a una constante es un error de compilación.

### VAR_IN_OUT y referencias

- Un `VAR_IN_OUT` de un bloque de función se pasa por referencia: lo que el cuerpo cambia lo ve quien llama. La variable debe ser del mismo tipo y no puede ser una constante. Un bloque llamado sin enlazarlo termina el scan con una falla de VM.
- `REF_TO`, `REF()` y `^` se controlan por tipo: `REF(x)` es una referencia al tipo de `x` y solo entra en un `REF_TO` de ese tipo. Una variable `REF_TO` es `NULL` hasta que se le asigna algo, y desreferenciar `NULL` termina el scan con la falla de VM `ZPLC_VM_OUT_OF_BOUNDS`.

## Nombres y tipos

Cada regla de abajo está cubierta por un caso de conformidad en `conformance/cmp` (CMP-003, CMP-004, CMP-006).

- Los nombres no distinguen mayúsculas de minúsculas, como indica IEC 61131-3: variables, funciones, bloques de función, miembros de estructura, valores de enumeración, nombres de parámetros, nombres de tipo y direcciones directas. `MyVar`, `myvar` y `MYVAR` son la misma variable, `byte` es `BYTE` y `%ix0.0` es `%IX0.0`. Dos declaraciones cuyos nombres difieren solo en mayúsculas son un duplicado y un error de compilación.
- Una declaración cuyo tipo no es un tipo es un error de compilación que nombra el tipo y su posición. Eso cubre un nombre mal escrito y los tipos que ZPLC 2.0 no tiene: `LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` y `WCHAR` (previstos para 2.x).
- `VAR PERSISTENT` es un error de compilación en la palabra `PERSISTENT`. Declare las variables `RETAIN` para conservar su valor entre reinicios.

## Tipos de los valores

Cada regla de abajo está cubierta por un caso de conformidad en `conformance/cmp` (CMP-005, CMP-012, CMP-018).

- Todo valor que entra en un lugar de un tipo se controla contra ese tipo: el lado derecho de una asignación, un valor inicial, un argumento de una función o de un bloque de función, el valor de una función y una salida enlazada con `=>`. Un valor de un tipo que no se convierte es un error de compilación que nombra los dos tipos.
- Los enteros, las cadenas de bits y `REAL` forman una familia. Un tipo entero, `BYTE`, `WORD` y `DWORD` se convierten entre sí, y un valor que no cabe en el destino conserva sus bits bajos y la compilación avisa (`IMPLICIT_NARROWING`, véase [Conversiones](#conversiones)). Un entero se convierte a `REAL` y a `LREAL`, y `REAL` a `LREAL`. Un `REAL` no se convierte a un entero: escriba `REAL_TO_INT(x)`.
- `BOOL` no se convierte a ni desde nada más, y tampoco `TIME`, `DATE`, `TOD` y `DT`: `i := b;`, `b := 1;` y `n := t;` son errores de compilación. La diferencia de dos valores `DT`, `TOD` o `DATE` es un `TIME`.
- La condición de `IF`, `ELSIF`, `WHILE` y `UNTIL` es un `BOOL`: escriba `IF count <> 0 THEN`, no `IF count THEN`. La aritmética no toma un `BOOL`, `MOD` toma enteros, y `AND`, `OR`, `XOR` y `NOT` toman `BOOL` o cadenas de bits, no `REAL`; un `BOOL` no se compara con un número.
- Una expresión constante (literales, constantes con nombre, `+ - * /` y `MOD` de ellos) debe caber en el tipo al que va: `small : SINT := 300;`, `level := -1;` para un `USINT` y `doubled := limit * 2;` con una constante `limit` de 20000 son errores de compilación. Una variable se controla por su tipo, no por su valor.
- Un literal mayor que 2147483647 es un valor de 32 bits sin signo: va a una variable `UDINT` o `DWORD`, a un parámetro `UDINT` y a `AND_DWORD`, `OR_DWORD`, `XOR_DWORD` y `NOT_DWORD`; un literal fuera del rango de un parámetro `WORD` es un error.

## Funciones y bloques de función

Cada regla de abajo está cubierta por un caso de conformidad en `conformance/cmp` (CMP-034, CMP-035, CMP-037).

- Cada función es un ámbito propio: dos funciones pueden declarar parámetros y locales con los mismos nombres, y un parámetro puede llamarse como una variable de un programa. Dentro de una función, un nombre es primero una variable propia y luego una `VAR_GLOBAL` (las variables de un programa no se ven allí). El nombre de la función es su variable de resultado.
- Una función se llama con los argumentos por posición, `Sub(10, 2)`, o por nombre en cualquier orden, `Sub(b := 2, a := 10)`. Los argumentos posicionales van primero. Un parámetro dado dos veces, un nombre que la función no tiene, un argumento de más y un parámetro obligatorio sin argumento son errores de compilación; un parámetro que declara un valor inicial (`factor : INT := 10;`) puede omitirse y vale ese valor.
- Una llamada puede ser una sentencia: `Bump(amount := 2);` ejecuta la función y descarta su resultado. Una función puede declararse antes o después de las que la llaman, y ninguna puede llamarse a sí misma, directamente o a través de otras: es un error de compilación en la llamada que cierra el ciclo.
- Un bloque de función se llama con parámetros con nombre. `IN := x` da una entrada y `Q => y` copia la salida `Q` en la variable `y` después de la llamada (`y` puede ser un miembro o un elemento). Los nombres se comparan sin distinguir mayúsculas de minúsculas. Un nombre que el bloque no tiene, una local del bloque, una salida con valor dado con `:=` y una entrada enlazada con `=>` son errores de compilación. La llamada posicional de un bloque de función queda para 2.x.

## Métodos, herencia e interfaces

Cada regla de esta sección está cubierta por un caso de conformidad en `conformance/cmp` (CMP-041).

- **Métodos.** Un método se llama sobre una instancia, `valve.Open()`, o por su nombre dentro del bloque, `Open()` o `THIS.Open()`. Un método tiene entradas y locales propias, y su valor es lo que asigna a su propio nombre (`cmp-041-this-member-in-method`, `cmp-041-method-with-several-assignments-called-in-a-loop`). Los argumentos de una llamada son valores del llamador: un nombre en ellos es el del llamador, aunque el método declare uno igual.
- **Herencia.** `EXTENDS` da al bloque derivado las variables y los métodos de su base. `OVERRIDE` reemplaza un método y es obligatorio para hacerlo; `FINAL` en un método prohíbe sobrescribirlo, y `FUNCTION_BLOCK FINAL` prohíbe extender el bloque (`cmp-041-override-and-inherited-method`, `cmp-041-final-method-cannot-be-overridden`, `cmp-041-final-block-cannot-be-extended`).
- **SUPER^.** `SUPER^.Metodo()` llama al método de la base del bloque que declara el código que se ejecuta, y `SUPER^();` ejecuta el cuerpo de ese bloque base, sobre la misma instancia. Un bloque derivado no ejecuta por sí solo el cuerpo de su base. Con tres niveles, cada `SUPER^` es el nivel de arriba, no la base de la instancia (`cmp-041-super-call`, `cmp-041-super-call-runs-the-base-body`, `cmp-041-super-call-through-three-levels`).
- **ABSTRACT.** Un método declarado `ABSTRACT` no tiene cuerpo, y el bloque que declara uno es `FUNCTION_BLOCK ABSTRACT`. Un bloque abstracto no tiene instancias, y un bloque que no es abstracto implementa todos los métodos abstractos que hereda. Un método de la base puede llamar al método abstracto: el que se ejecuta es el del bloque de la instancia (`cmp-041-abstract-method-is-run-by-the-derived-block`, `cmp-041-abstract-block-cannot-be-instantiated`, `cmp-041-abstract-method-left-unimplemented-is-rejected`).
- **Acceso.** Un método `PRIVATE` se llama solo dentro del bloque que lo declara, y uno `PROTECTED` dentro de ese bloque y de los bloques que lo extienden; `PUBLIC` es el valor por defecto. Una llamada desde un programa, una función u otro bloque es un error de compilación que nombra el método y dónde puede llamarse (`cmp-041-private-method-is-not-callable-from-outside`, `cmp-041-protected-method-is-not-callable-from-outside`, `cmp-041-protected-method-is-callable-from-a-derived-block`, `cmp-041-private-method-is-not-callable-from-a-derived-block`).
- **Interfaces.** Una variable de tipo interfaz guarda una referencia a una instancia, `NULL` hasta que se le asigna una. Acepta una instancia de un bloque que declara `IMPLEMENTS` para la interfaz (o extiende uno que lo hace), otra variable de la interfaz o `NULL`; cualquier otra cosa es un error de compilación. `shape.Area()` ejecuta el método de la instancia a la que se refiere la variable, sea de cualquier bloque, incluido un elemento de un arreglo elegido en ejecución y una instancia de un bloque derivado (`cmp-041-interface-dispatch`, `cmp-041-interface-dispatch-by-the-instance-assigned`, `cmp-041-interface-variable-as-an-input-of-a-block`, `cmp-041-interface-through-inheritance-and-array-elements`). Una llamada por una variable que no guarda ninguna instancia termina el ciclo con un fallo de la VM (`cmp-041-interface-call-of-a-null-reference-faults`).

Cómo se construye una llamada por interfaz: un bloque de función se incorpora al código en cada lugar donde se llama, con las direcciones de su instancia. La referencia de una variable de interfaz es la dirección de la instancia en los 16 bits bajos y la etiqueta del tipo de su bloque en los 16 bits altos. Para cada llamada el compilador enumera todas las instancias del proyecto de un bloque que implementa la interfaz (variables, elementos de arreglo, instancias dentro de otros bloques y de estructuras), y escribe una comparación de la referencia con cada una, con el método incorporado sobre esa instancia detrás. Una referencia que no coincide con ninguna es un fallo de la VM. El costo es código, no tiempo de ejecución: una llamada por interfaz es tan grande como la suma de los métodos de todas las instancias que pueden responderla, de modo que una interfaz implementada por bloques de los que el proyecto tiene muchas instancias conviene llamarla desde un bloque de función y no desde muchos lugares.

## Proyectos, archivos y memoria

Cada regla de esta sección está cubierta por un caso de conformidad en `conformance/cmp` (CMP-042, CMP-043) y por `packages/zplc-compiler/src/compiler/unit.test.ts`.

- **Una sola unidad.** Todos los archivos Structured Text de un proyecto (`src/*.st`) se compilan como una sola unidad, sin importar si una tarea ejecuta un programa que está en ellos. Un tipo, una función, un bloque de función, una interfaz o un `VAR_GLOBAL` declarado en cualquier archivo es visible para todos los programas, y el archivo que usa un tipo puede ir antes que el que lo declara (`cmp-042-function-block-in-another-file`, `cmp-042-global-in-another-file`, `cmp-042-type-from-another-file-in-a-structure`). Un `PROGRAM` que ninguna tarea ejecuta no se compila. Los lenguajes gráficos y Instruction List se compilan cuando una tarea los ejecuta.
- **Una global es una sola variable.** Un `VAR_GLOBAL` tiene una dirección, compartida por todos los programas y todas las tareas, y un valor inicial que se aplica una vez, antes del primer ciclo de la tarea que se ejecute primero (`cmp-042-two-tasks-share-a-global`). Una función se compila una sola vez y los programas de ambas tareas la llaman (`cmp-042-function-from-another-file-in-two-programs`). Dos programas pueden declarar variables con el mismo nombre: cada uno conserva la suya.
- **Una declaración repetida es un error en ambos lugares.** Un tipo, una función, un bloque de función o una interfaz declarados en dos archivos, o una global declarada dos veces, se informan en cada declaración, y el mensaje nombra ambos archivos y líneas (`cmp-042-function-block-declared-in-two-files-is-rejected`). Un error de un archivo se informa en ese archivo, sin importar qué programa use lo que el archivo declara.
- **Una sola memoria.** Las variables de las globales, las funciones, las instancias de bloques de función, los programas, los literales de cadena y los buffers de trabajo de las funciones de cadena de todo el proyecto comparten la memoria WORK del perfil del destino: 8192 bytes en el destino `posix`. No hay un límite por programa ni por tarea (`cmp-043-programs-share-the-region`, `cmp-043-program-that-fills-the-region`). Un byte de ella, el último, es la bandera de inicialización.
- **Disposición.** El compilador coloca, en este orden: las globales, las variables de cada función, las variables de los métodos, las variables de cada programa en el orden de las tareas, los literales de cadena y los buffers de trabajo. Cada variable se alinea a su tamaño hasta 4 bytes, de modo que el mismo proyecto da siempre las mismas direcciones. Las direcciones que cambian porque se agregó otro archivo las informa el mapa de depuración, que lista cada una (véase [Modelo de Memoria](../runtime/memory-model.md)).
- **Un fallo de asignación dice qué necesita.** Un proyecto que no cabe es un error de compilación en la declaración que cruza el final de la región, y el mensaje indica los bytes requeridos, los bytes disponibles y los tres mayores consumidores: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (...). Largest consumers: Overflow.Table (9000 bytes), Overflow.Gain (4 bytes)` (`cmp-043-allocation-failure-states-bytes-and-consumers`). Un destino con menos memoria WORK tiene un límite menor: el proyecto se compila contra el perfil de la placa que nombra.

## Entrada a la biblioteca estándar

Ver [Biblioteca Estándar](./stdlib.md).

## Límites conocidos

Esta sección lista lo que el compilador, el cargador y el mapa de depuración no hacen como pide IEC 61131-3. La tabla se genera a partir de los casos de conformidad que se espera que fallen (`tools/ci/expected-failures.json`) y de la descripción de cada requisito en `docs/known-limits.json`: una fila existe mientras falle al menos un caso de su requisito, y desaparece cuando pasa el último. Los bloques y funciones estándar tienen su propia tabla en la [sección 11 de la referencia de la biblioteca estándar](../runtime/stdlib.md#11-diferencias-conocidas-con-iec-61131-3).

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-language. Do not edit. >>> */}
| Requisito | Qué ocurre hoy | Casos que fallan hoy |
|---|---|---|
| CMP-015 | `LINT`, `ULINT` y `LWORD` no tienen `*`, `/`, `MOD`, `SHL`, `SHR`, `ROL`, `ROR`, `ABS`, conversión desde o hacia `REAL`, selector de `CASE` ni contador de `FOR`: cada uno es un error de compilación que nombra CMP-015. Un programa que asigna o calcula con un `LREAL` se compila y luego es rechazado por el cargador. | `LREAL keeps double precision` |
| CMP-051 | El cargador rechaza el artefacto que el compilador genera para un programa con un `LREAL` y para dos tareas cíclicas con intervalos distintos. | `the loader accepts every artifact the compiler produced for a conformance case` |
| RT-015 | Una tarea con `trigger: event` es aceptada por el compilador y rechazada después, y un programa con dos tareas cíclicas de intervalos distintos es rechazado por la simulación nativa. | `an event-triggered task is rejected by the build`<br />`two cyclic tasks with different intervals load in simulation and each runs at its own interval` |
{/* <<< END GENERATED: known-limits-language <<< */}

No soportado en esta versión y rechazado con un mensaje, por la decisión D-04: arreglos de arreglos, enumeraciones con tipo base, subrangos, `POINTER TO` y `ADR` (use `REF_TO` y `REF()`), `VAR_ACCESS`, una `CONFIGURATION` textual, `NAMESPACE`, `PROPERTY`, bloques `ACTION` en un programa, llamadas posicionales a bloques de función y las formas de función de los operadores como `ADD(a, b)`. Los casos `cmp-006-*-is-rejected` pasan: fijan el rechazo, de modo que un programa que usa uno de ellos no compila.
