---
sidebar_position: 1
---

# Texto estructurado (ST)

El texto estructurado es el lenguaje principal de ZPLC y el primero que conviene aprender. Esta página enseña a escribirlo y expone las reglas que aplica el compilador: tipos, conversiones, tiempo, datos, funciones, bloques de función y organización del proyecto. Qué funciona, elemento por elemento, y los casos ejecutados que lo respaldan, está en la [referencia generada del texto estructurado](../reference/language-st.md).

ST es el único lenguaje que el compilador lee directamente. La lista de instrucciones, la escalera, el diagrama de bloques de función y el diagrama funcional secuencial se traducen primero a ST (`packages/zplc-ide/src/compiler/index.ts`), así que las reglas de abajo son también las reglas de todos los demás lenguajes. El runtime ejecuta el bytecode `.zplc` compilado, nunca el código fuente.

## Escribir y ejecutar un programa

Un programa declara sus variables y después lista instrucciones. Este cuenta ciclos y activa `Output_LED` cuando el contador llega al umbral:

```pascal runnable expect="Counter=3 Output_LED=FALSE" scans=3 scan_ms=10
PROGRAM Main
    VAR
        Counter: INT := 0;
        Threshold: INT := 100;
        Output_LED: BOOL := FALSE;
    END_VAR

    Counter := Counter + 1;

    IF Counter >= Threshold THEN
        Output_LED := TRUE;
        Counter := 0;
    ELSE
        Output_LED := FALSE;
    END_IF;
END_PROGRAM
```

Cada ciclo suma 1 a `Counter`, y `Output_LED` sigue en `FALSE` hasta que `Counter` llega a `Threshold`. Después de tres ciclos, `Counter` vale 3. La integración continua compila el ejemplo, lo ejecuta durante tres ciclos de 10 ms y comprueba ambos valores.

Los bloques de función estándar se declaran como variables y se llaman con parámetros con nombre. Este arranca un temporizador `TON`, y `Out1` pasa a `TRUE` cuando ha contado 250 ms:

```st runnable expect="Out1=TRUE" scans=30 scan_ms=10
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

La integración continua lo ejecuta durante 30 ciclos de 10 ms y comprueba que `Out1` sea `TRUE`. Los bloques y funciones que puede llamar están en la [biblioteca estándar](../runtime/stdlib.md).

## La sintaxis de un vistazo

Los tipos elementales son:

- `BOOL`;
- `SINT`, `INT`, `DINT`, `LINT` (enteros con signo de 8, 16, 32 y 64 bits) y `USINT`, `UINT`, `UDINT`, `ULINT` (sin signo);
- `BYTE`, `WORD`, `DWORD`, `LWORD` (cadenas de bits de 8, 16, 32 y 64 bits);
- `REAL` (32 bits) y `LREAL` (64 bits, doble precisión IEEE 754);
- `TIME`, `DATE`, `TOD`, `DT`, vea [Tipos de tiempo y fecha](#tipos-de-tiempo-y-fecha);
- `STRING` y `WSTRING`.

Las estructuras de control son:

- `IF ... THEN ... ELSIF ... ELSE ... END_IF`;
- `CASE ... OF ... ELSE ... END_CASE`;
- `FOR ... TO ... BY ... DO ... END_FOR`;
- `WHILE ... DO ... END_WHILE`;
- `REPEAT ... UNTIL ... END_REPEAT`.

Los nombres no distinguen mayúsculas de minúsculas: `MyVar`, `myvar` y `MYVAR` son una sola variable, `byte` es `BYTE` y `%ix0.0` es `%IX0.0`. Dos declaraciones cuyos nombres solo difieren en las mayúsculas son un duplicado y un error de compilación. Se aceptan los comentarios `(* *)` y `/* */`, y también un `;` solo como instrucción vacía.

## Tipos numéricos

El caso nombrado en una fila o en una regla es un programa de conformidad bajo `conformance/cmp/` que se ejecuta en el runtime nativo. Los casos de los tipos de 64 bits y de `LREAL` dan los mismos resultados en una compilación de 64 bits y en una de 32 bits del runtime.

| Tipo    | Bits | Rango                                       | Orden                     | Caso de conformidad                  |
| ------- | ---- | ------------------------------------------- | ------------------------- | ------------------------------------ |
| `BOOL`  | 8    | `FALSE`, `TRUE`                             | sin orden                 | `harness/vf-001-bool-output-toggles` |
| `SINT`  | 8    | -128 a 127                                  | con signo                 | `cmp-011-sint-limits`                |
| `USINT` | 8    | 0 a 255                                     | sin signo                 | `cmp-012-usint-holds-0-to-255`       |
| `BYTE`  | 8    | cadena de bits, 0 a 255                     | sin signo                 | `cmp-014-not-byte`                   |
| `INT`   | 16   | -32768 a 32767                              | con signo                 | `cmp-011-int-limits`                 |
| `UINT`  | 16   | 0 a 65535                                   | sin signo                 | `cmp-012-uint-65535`                 |
| `WORD`  | 16   | cadena de bits, 0 a 65535                   | sin signo                 | `cmp-014-not-word`                   |
| `DINT`  | 32   | -2147483648 a 2147483647                    | con signo                 | `cmp-011-dint-limits`                |
| `UDINT` | 32   | 0 a 4294967295                              | sin signo                 | `cmp-012-udint-max`                  |
| `DWORD` | 32   | cadena de bits, 0 a 4294967295              | sin signo                 | `cmp-014-not-dword`                  |
| `LINT`  | 64   | -9223372036854775808 a 9223372036854775807  | con signo                 | `cmp-015-lint-extreme-values`        |
| `ULINT` | 64   | 0 a 18446744073709551615                    | sin signo                 | `cmp-015-ulint-compares-unsigned`    |
| `LWORD` | 64   | cadena de bits, 0 a 18446744073709551615    | sin signo                 | `cmp-015-ulint-compares-unsigned`    |
| `REAL`  | 32   | IEEE 754 de precisión simple                | orden IEEE, NaN sin orden | `cmp-013-real-nan-is-unordered`      |
| `LREAL` | 64   | IEEE 754 de doble precisión                 | orden IEEE, NaN sin orden | `cmp-015-lreal-comparisons-and-nan`  |

### Aritmética, desbordamiento y división

- **Ancho de un cálculo.** Los operandos de 8 y 16 bits se amplían a 32 bits para la operación, y el resultado se recorta a su ancho solo cuando se almacena. Con `i : INT := 32767`, `i + 1` vale 32768 dentro de una expresión y -32768 una vez almacenado en un `INT`; un `UINT` de 65535 más 1 almacenado en un `UINT` vale 0 (`cmp-012-uint-65535`).
- **Los 32 y 64 bits se desbordan en complemento a dos.** `DINT` 2147483647 más 1 es -2147483648, y la resta y la multiplicación se desbordan igual. El `DINT` más negativo, negado, pasado a `ABS` o dividido por -1, sigue siendo el `DINT` más negativo, y ese valor `MOD` -1 es 0 (`cmp-016-dint-add-wraps`, `cmp-016-dint-min-divided-by-minus-one`). `LINT` se desborda igual, y su producto son los 64 bits bajos (`cmp-015-lint-multiplication-wraps-at-64-bits`).
- **La división trunca hacia cero, y `MOD` toma el signo del dividendo**, como en C: -7 / 2 es -3 y -7 `MOD` 2 es -1 (`cmp-011-int-divide-negative`). `UDINT`, `ULINT` y `LWORD` dividen y calculan `MOD` sin signo en todo su rango (`cmp-012-udint-divide-and-modulo`, `cmp-015-ulint-division-above-2-63`).

:::warning
La división o `MOD` por cero termina el ciclo con la falla de la VM `ZPLC_VM_DIV_BY_ZERO` (código 0x03). Lo mismo ocurre con una división de `REAL` o `LREAL` por 0.0 o -0.0 y con una división o `MOD` de `LINT` o `ULINT` por cero (`cmp-015-lint-division-by-zero-faults`). Compruebe el divisor antes de dividir. Lo que una falla hace con las salidas está en [Pausa, reanudación, paso y Stop](../runtime/scheduler.md#pausa-reanudación-paso-y-parada).
:::

### Desplazamientos, rotaciones y lógica de bits

- `SHL(IN, N)`, `SHR(IN, N)`, `ROL(IN, N)` y `ROR(IN, N)` son funciones. Un desplazamiento de 32 o más, o con un contador negativo, da 0 (`cmp-016-shift-by-the-width-or-more`). `SHR` es lógico: entran ceros por la izquierda.
- Un `BYTE`, un `WORD` y los enteros de 8 y 16 bits se desplazan y rotan dentro de su propio ancho (`cmp-014-shl-byte-keeps-8-bits`, `cmp-014-rol-byte-rotates-within-8-bits`). En `LWORD`, `LINT` y `ULINT` el ancho es 64: un desplazamiento de 64 o más da 0, y una rotación toma su contador módulo 64 y conserva todos los bits (`cmp-015-lword-shifts-and-rotates-use-64-bits`).
- `AND`, `OR`, `XOR` y `NOT` actúan sobre todo el ancho declarado (`cmp-014-not-byte`, `cmp-014-and-or-xor-word`).
- `w.0` lee y escribe un bit de un `BYTE`, `WORD`, `INT`, `DWORD` o `LWORD`, de un miembro de estructura y de un elemento de arreglo; una escritura deja intactos los demás bits. Un número de bit fuera del ancho y un bit de un `BOOL` son errores de compilación (`cmp-032-bit-access`, `cmp-032-bit-number-out-of-range`).

### Conversiones

- **Ampliar conserva el valor.** Un tipo con signo se extiende con el signo, y un tipo sin signo o una cadena de bits se extiende con ceros: `INT` -5 pasa a `DINT` -5 (`cmp-011-int-widens-to-dint`).
- **Estrechar al asignar conserva los bits bajos, y la compilación avisa.** Un `DINT` 70000 almacenado en un `INT` vale 4464 (`cmp-005-integer-narrowing-keeps-the-low-bits-and-warns`). La compilación termina bien e informa de la advertencia `IMPLICIT_NARROWING` en el valor, con el nombre de ambos tipos. Una constante que no cabe es un error. Enmascare el valor, o declare el destino con el ancho suficiente, para quitar la advertencia.
- **Un entero pasa a `REAL` o a `LREAL` cuando se asigna a uno o se mezcla con uno**: `INT` por `REAL` es un `REAL` (`cmp-013-int-times-real`). `LREAL` es el tipo numérico más ancho. Un literal real en una expresión `LREAL` es el doble que escribe, así que `0.1 + 0.2` vale 0.30000000000000004, mientras que una expresión de valores `REAL` se calcula en precisión simple y se amplía (`cmp-015-lreal-literal-takes-the-type-of-its-context`).
- **De `LREAL` a `REAL` se estrecha y avisa**: el resultado se redondea a precisión simple, unas 7 cifras significativas, y una magnitud superior a 3.4e38 se convierte en infinito. Escriba `LREAL_TO_REAL(d)` para decirlo.
- **Un real nunca pasa a entero de forma implícita.** `i := r` y una expresión entera asignada a un `BOOL` son errores de compilación que nombran ambos tipos (`cmp-005-int-assigned-from-real`, `cmp-005-bool-assigned-from-int`). Escriba `REAL_TO_INT(r)` e `i <> 0` en su lugar.
- **`REAL_TO_INT` redondea al entero más cercano**, una mitad exacta al entero par, satura en los límites del destino y da 0 para un NaN (`cmp-057-real-to-int-ties-go-to-even`, `cmp-057-real-to-integer-saturates-at-the-destination-range`). `REAL_TO_DINT(TRUNC(x))` trunca hacia cero.
- Existe una función de conversión `<FROM>_TO_<TO>` para cada par de tipos distintos entre `BOOL`, los enteros, las cadenas de bits, `REAL`, `LREAL` y `TIME`. `DATE`, `TOD` y `DT` todavía no tienen ninguna.
- `BOOL` no se convierte hacia ni desde nada más, y tampoco `TIME`, `DATE`, `TOD` y `DT`: `i := b;`, `b := 1;` y `n := t;` son errores de compilación. Un `STRING` o `WSTRING` es texto y no se convierte a ningún número, `BOOL` ni tiempo, y ninguno se convierte a él (`cmp-005-string-assigned-to-int`).
- La condición de `IF`, `ELSIF`, `WHILE` y `UNTIL` es un `BOOL`: escriba `IF count <> 0 THEN`, no `IF count THEN`. La aritmética no acepta un `BOOL`, y `AND`, `OR`, `XOR` y `NOT` aceptan `BOOL` o cadenas de bits, no `REAL`.
- Una expresión constante debe caber en el tipo al que va: `small : SINT := 300;` es un error de compilación. Una variable se comprueba por su tipo, no por su valor. Un literal superior a 2147483647 es un valor de 32 bits sin signo y va a un `UDINT` o un `DWORD`.

Pruebe la regla de redondeo:

```st runnable expect="Down=3 Tie=2 Up=4" scans=1 scan_ms=10
PROGRAM RoundTrip
VAR
    Down : INT;
    Tie : INT;
    Up : INT;
END_VAR
Down := REAL_TO_INT(2.6);
Tie := REAL_TO_INT(2.5);
Up := REAL_TO_INT(3.5);
END_PROGRAM
```

### Operandos mixtos y comparación

- **El tipo de una operación es el del operando más ancho.** `REAL` gana a todos los enteros, `LREAL` gana a `REAL`, y entre dos tipos del mismo ancho gana el que no tiene signo, como en C. `DINT` -1 comparado con `UDINT` 5 es una comparación sin signo, así que `-1 < 5` es FALSE, mientras que `INT` -1 comparado con `UINT` 5 es TRUE porque ambos se amplían primero a 32 bits. La regla es `commonType` en `packages/zplc-compiler/src/compiler/numeric.ts`.
- **Los tipos sin signo se comparan sin signo en todo su rango**: `UDINT` 4294967295 es el valor mayor (`cmp-012-udint-max`).
- **`REAL` y `LREAL` se comparan según el orden IEEE 754.** -0.0 es igual a 0.0, los infinitos se ordenan más allá de todo valor finito, y un NaN no es igual, menor ni mayor que nada, ni siquiera que sí mismo (`cmp-013-real-nan-is-unordered`).

### Tipos de 64 bits y `LREAL`

`LINT`, `ULINT`, `LWORD` y `LREAL` ocupan dos celdas de la pila de evaluación. Cada operación es una instrucción de la VM, o una secuencia corta fija, igual en todas las plataformas: los códigos de operación de doble precisión se calculan con aritmética entera, de modo que un resultado es el mismo patrón de bits en un host de 64 bits, en uno de 32 bits y en un destino. Los resultados que define la VM están en el [conjunto de instrucciones del runtime](../runtime/isa.md#valores-de-dos-palabras-enteros-de-64-bits-y-lreal).

- **Funciona:** aritmética, comparación, desplazamientos, `ABS`, un contador `FOR` y un selector `CASE` con etiquetas de 64 bits, literales en todo el rango y en cualquier base, y `LREAL` en arreglos, estructuras, parámetros y resultados de funciones y en `RETAIN` (`cmp-015-lint-extreme-values`, `cmp-015-lint-for-counter-crosses-32-bits`, `cmp-015-lreal-and-lint-in-arrays-structures-and-calls`).
- **Funciones de `LREAL`:** `ABS`, `NEG`, `MAX`, `MIN`, `LIMIT`, `SEL`, `MUX`, `SQRT`, `TRUNC` y `ROUND` son exactas. `SIN`, `COS`, `TAN`, `EXP`, `LN`, `LOG`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `EXPT` y `**` calculan en precisión simple: el argumento se redondea a `REAL` y el resultado se vuelve a ampliar, así que tienen unas siete cifras significativas (`cmp-015-lreal-transcendental-functions-compute-in-real`).
- **Todavía se rechaza, con un mensaje que dice por qué:** un argumento de 64 bits o `LREAL` en las funciones de cadena, en `AND_WORD` y sus parientes y en los bloques de comunicación; un valor de 64 bits como índice de arreglo (conviértalo con `LINT_TO_DINT`); un `LREAL` como contador `FOR` o selector `CASE`; y `AND`, `OR`, `XOR`, `NOT` y `MOD` sobre un `LREAL`.

## Tipos de tiempo y fecha

| Tipo                   | Ancho              | Qué contiene                                                       | Literal                           |
| ---------------------- | ------------------ | ------------------------------------------------------------------ | --------------------------------- |
| `TIME`                 | 32 bits, sin signo | Una duración en milisegundos, 0 a 4294967295 (`T#49d17h2m47s295ms`) | `T#1h30m`, `T#1.5s`, `TIME#250ms` |
| `DATE`                 | 32 bits, con signo | Segundos desde 1970-01-01; las fechas anteriores son negativas     | `D#2024-01-01`                    |
| `TOD` (`TIME_OF_DAY`)  | 32 bits, sin signo | Milisegundos desde la medianoche                                   | `TOD#12:30:00`                    |
| `DT` (`DATE_AND_TIME`) | 64 bits, con signo | Milisegundos desde 1970-01-01 00:00:00                             | `DT#2024-01-01-12:00:00`          |

### TIME

- Un literal tiene días, horas, minutos, segundos y milisegundos, cada uno como máximo una vez y en ese orden, con un `_` opcional entre ellos (`T#1d_2h_3m_4s_5ms`). Se aceptan `us` y `ns` cuando todo el literal es un número entero de milisegundos, y el último componente puede tener fracción (`T#1.5s`).
- Un literal que no es un número entero de milisegundos (`T#1.5ms`), que supera 4294967295 ms (`T#50d`), que es negativo (`T#-5s`) o que tiene las unidades desordenadas (`T#30m1h`) es un error de compilación que nombra el literal (`cmp-017-time-literal-below-a-millisecond`, `cmp-017-time-literal-above-the-range`).
- La comparación, la suma, la resta y la división son de 32 bits sin signo: `T#30d > T#1d` es TRUE. Un valor preestablecido de temporizador superior a 24,8 días funciona.
- **Una duración negativa no se puede representar.** Una resta por debajo de cero se desborda módulo 2^32: `T#0s - T#1s` vale 4294966296 ms, y la compilación no da ninguna advertencia. Compruebe que el minuendo no sea menor antes de restar.
- La tabla de observación muestra un `TIME` superior a 2147483647 ms (24d20h31m23s647ms) como un número negativo, porque los adaptadores de observación leen sus 32 bits como con signo. El valor que guarda el programa es la cuenta sin signo.
- Si `TIME` sigue siendo una cuenta de 32 bits sin signo o pasa a ser un valor de 64 bits con signo es una decisión abierta de la persona propietaria. Esta página no anuncia ningún cambio.

### DATE, TOD y DT

- `TOD` y `DT` guardan milisegundos, la unidad de `TIME`. `TOD#12:30:00 + T#1h` es 13:30:00, y la diferencia de dos valores `DT` es un `TIME`. Los tres tipos se asignan y se comparan.
- `DATE` cuenta segundos, no milisegundos. Se asigna y se compara (`D#2024-01-01 < D#2025-06-30`), pero sumar un `TIME` a un `DATE` suma milisegundos a una cuenta de segundos: no lo haga. Ningún caso de conformidad cubre la aritmética de `DATE`.
- Un literal `DT#` se lee en la zona horaria de la máquina que compila, mientras que `D#` y `TOD#` se leen como UTC. El mismo código fuente compilado en dos zonas horarias da dos constantes `DT` distintas. Es un defecto, no un diseño, y todavía ningún caso de conformidad lo fija.

### Tipos no admitidos

`LTIME`, `LDATE`, `LTOD`, `LDT`, `CHAR` y `WCHAR` no forman parte de ZPLC 2.0. La declaración de uno de ellos, como la de cualquier nombre de tipo desconocido, es un error de compilación que nombra el tipo y su posición (`cmp-003-*` en `conformance/cmp/`).

Nivel de evidencia: host. Los casos `cmp-017-*` se compilan con el compilador del repositorio y se ejecutan en el runtime nativo, y `packages/zplc-compiler/src/compiler/time.test.ts` cubre la gramática de los literales y sus rechazos. El desbordamiento por debajo de cero, la zona horaria de `DT#` y la visualización en la tabla de observación se observaron o se leyeron del código, y ningún caso las fija todavía.

## Literales, operadores y declaraciones

- **Literales numéricos.** Literales con base `2#1010`, `8#17` y `16#FF`, con signo menos y con separadores de dígitos; `1_000`; y literales con tipo como `INT#5`. Una base distinta de 2, 8 y 16, y un literal con tipo fuera del rango de su tipo, son errores de compilación (`cmp-031-hexadecimal-literal`, `cmp-031-typed-literal-out-of-range`). La forma antigua `0xFF` todavía se compila y la compilación informa de la advertencia `NON_IEC_HEX_LITERAL`; `1e3`, un literal real con exponente y sin fracción, se compila y se informa como `NON_IEC_REAL_LITERAL`. Las advertencias y la opción que las selecciona están en la [página del compilador](../ide/compiler.md#advertencias).
- **Operadores.** `&` tiene la precedencia de `AND`. `**` es la potencia: los operandos enteros se convierten a `REAL`, se asocia con más fuerza que el signo menos y la multiplicación, y `0.0 ** -1.0` entra en falla como una división por cero (`cmp-032-ampersand-operator`, `cmp-032-power-precedence`).
- **Declaraciones.** Se aceptan `VAR RETAIN`, `VAR NON_RETAIN` y `VAR_GLOBAL RETAIN`. Una variable retentiva toma su valor inicial declarado solo cuando la región retentiva no tiene ningún estado guardado, así que una región restaurada conserva sus valores. Varios nombres en una misma declaración comparten su valor inicial. `VAR_EXTERNAL` debe nombrar una global del mismo tipo. `VAR_TEMP` se acepta en un programa y `VAR_OUTPUT` en una función. Se acepta un alias de tipo, también de una estructura o de un arreglo, y se rechazan los alias que se refieren entre sí. `VAR PERSISTENT` es un error de compilación: declare las variables como `RETAIN` para conservar su valor tras un reinicio.
- **Diagnósticos.** Un archivo con varios errores independientes informa de cada uno, en orden, sin los falsos errores que dejaba un `IF` roto. Una declaración duplicada y un miembro desconocido se informan en su propia línea, y se rechaza una llamada que pasa un argumento que ningún `VAR_INPUT` acepta (`cmp-007-three-errors-three-diagnostics`, `cmp-035-unknown-argument-name`).

## Datos, almacenamiento y valores iniciales

### Estructuras, enumeraciones y arreglos

- Un miembro de una estructura o de un bloque de función se lee y se escribe con su ancho declarado. Los miembros se anidan a cualquier profundidad: `a.b.c`.
- Una estructura o un arreglo completos se asignan, y se pasan a una función, por valor: se copia cada byte, y ambos lados deben ser del mismo tipo.
- Una estructura toma un valor inicial de la forma `(x := 1, y := 2)`. Un campo omitido conserva el valor por defecto de su declaración.
- Una enumeración se almacena como un `INT`. Un valor se puede escribir `Tipo#Valor`, lo que además distingue un nombre de valor que comparten dos enumeraciones.
- Un arreglo tiene de una a tres dimensiones, límites inferiores negativos y límites que son expresiones constantes (`ARRAY[-N .. N * 2] OF INT`). Sus elementos pueden ser de cualquier tipo. Un valor inicial es una lista `[1, 2, 3]`, listas anidadas para más dimensiones y conteos de repetición `[100(0)]`.
- Un índice constante fuera de los límites es un error de compilación. Un índice variable fuera de los límites termina el ciclo con la falla de la VM `ZPLC_VM_OUT_OF_BOUNDS`. La comprobación está activa por defecto; la opción del compilador `arrayBoundsCheck: false` la quita.

### Cadenas

- `STRING` guarda 80 caracteres, `STRING[n]` guarda `n`, y `WSTRING[n]` guarda `n` caracteres de 16 bits.
- Una asignación copia los caracteres, hasta la capacidad del destino. Un literal más largo que la capacidad de su variable es un error de compilación.
- Una función de cadena nunca modifica sus argumentos: `LEFT`, `RIGHT`, `MID`, `CONCAT`, `INSERT`, `DELETE` y `REPLACE` devuelven una cadena nueva. `COPY(src, dst)` y `CLEAR(s)` escriben en su argumento.
- `s := LEFT(s, n)` actúa sobre la propia variable. Cualquier otra función de cadena que construya una cadena usa un búfer de trabajo de la memoria WORK del programa, que cuenta contra los bytes del programa.
- `WSTRING` se puede declarar, inicializar, asignar y medir con `LEN`. Las demás funciones de cadena y la comparación la rechazan con un mensaje.

### Valores iniciales y constantes

- En el primer ciclo, cada variable guarda su valor inicial declarado, o el valor por defecto de su tipo: cero, `FALSE`, la cadena vacía, `NULL`. Esto abarca programas, `VAR_GLOBAL`, cada miembro de cada instancia de bloque de función, campos de estructura y elementos de arreglo.
- Una variable local de una función y un `VAR_TEMP` de un bloque de función recuperan su valor declarado en cada llamada, así que una función no guarda estado. Un `VAR` de un bloque de función conserva su valor de una llamada a otra.
- `VAR CONSTANT` y `VAR_GLOBAL CONSTANT` conservan su valor, y asignar a una constante es un error de compilación.

### VAR_IN_OUT y referencias

- Un `VAR_IN_OUT` de un bloque de función se pasa por referencia: lo que cambia el cuerpo, lo ve quien llama. La variable debe ser del mismo tipo y no puede ser una constante. Un bloque llamado sin asociarlo termina el ciclo con una falla de la VM.
- `REF_TO`, `REF()` y `^` tienen comprobación de tipos: `REF(x)` solo entra en un `REF_TO` del tipo de `x`. Una variable `REF_TO` es `NULL` hasta que se le asigna algo, y desreferenciar `NULL` termina el ciclo con la falla de la VM `ZPLC_VM_OUT_OF_BOUNDS`.

## Funciones y bloques de función

- Cada función es un ámbito propio. Dentro de una función, un nombre es primero su propia variable y después una `VAR_GLOBAL`; las variables de un programa no son visibles ahí. El nombre de la función es su variable de resultado.
- Una función se llama con los argumentos por posición, `Sub(10, 2)`, o por nombre en cualquier orden, `Sub(b := 2, a := 10)`, con los posicionales primero. Un parámetro dado dos veces, un nombre que la función no tiene, un argumento de más y un parámetro obligatorio sin argumento son errores de compilación. Un parámetro que declara un valor inicial (`factor : INT := 10;`) puede omitirse.
- Una llamada puede ser una instrucción, y el resultado se descarta. Una función puede declararse antes o después de las que la llaman, y ninguna puede llamarse a sí misma, directamente o a través de otras: es un error de compilación en la llamada que cierra el ciclo.
- Un bloque de función se llama con parámetros con nombre. `IN := x` da una entrada, y `Q => y` copia la salida `Q` en la variable `y` después de la llamada. Los nombres se comparan sin distinguir mayúsculas de minúsculas. Un nombre que el bloque no tiene, una salida a la que se da un valor con `:=` y una entrada asociada con `=>` son errores de compilación. La llamada posicional de un bloque de función queda para 2.x.
- Una instancia puede declararse dentro de un bloque de función, y los arreglos de instancias se llaman con un índice constante o en tiempo de ejecución, cada elemento con su propio estado (`cmp-038-array-of-instances`, `cmp-038-array-run-time-index`). Los nombres de los bloques de la biblioteca no son palabras reservadas: un bloque que declara el programa prevalece sobre el bloque de la biblioteca del mismo nombre.

## Métodos, herencia e interfaces

- **Métodos.** Un método se llama sobre una instancia, `valve.Open()`, o por su nombre dentro del bloque, `Open()` o `THIS.Open()`. Un método tiene sus propias entradas y locales, y su valor es lo que asigna a su propio nombre.
- **Herencia.** `EXTENDS` da al bloque derivado las variables y los métodos de su base. `OVERRIDE` reemplaza un método y es obligatorio para hacerlo; `FINAL` en un método prohíbe sobrescribirlo, y `FUNCTION_BLOCK FINAL` prohíbe extender el bloque (`cmp-041-override-and-inherited-method`, `cmp-041-final-method-cannot-be-overridden`).
- **`SUPER^`.** `SUPER^.Method()` llama al método de la base del bloque que declara el código en ejecución, y `SUPER^();` ejecuta el cuerpo de ese bloque base sobre la misma instancia. Un bloque derivado no ejecuta por sí solo el cuerpo de su base.
- **`ABSTRACT`.** Un método declarado `ABSTRACT` no tiene cuerpo, y el bloque que declara uno es `FUNCTION_BLOCK ABSTRACT`. Un bloque abstracto no tiene instancias, y un bloque que no es abstracto implementa todos los métodos abstractos que hereda.
- **Acceso.** Un método `PRIVATE` se llama solo dentro del bloque que lo declara, y uno `PROTECTED` dentro de ese bloque y de los bloques que lo extienden. `PUBLIC` es el valor por defecto. Una llamada desde otro lugar es un error de compilación que nombra el método.
- **Interfaces.** Una variable de tipo interfaz guarda una referencia a una instancia, `NULL` hasta que se le asigna una. Acepta una instancia de un bloque que declara `IMPLEMENTS` para la interfaz, otra variable de la interfaz, o `NULL`. `shape.Area()` ejecuta el método de la instancia a la que se refiere la variable, sea del bloque que sea (`cmp-041-interface-dispatch`). Una llamada a través de una variable que no guarda ninguna instancia termina el ciclo con una falla de la VM.

Un bloque de función se incorpora al código en cada lugar donde se llama. En una llamada a una interfaz, el compilador lista todas las instancias del proyecto de un bloque que implementa la interfaz, compara la referencia con cada una e incorpora el método tras cada comparación; una referencia que no coincide con ninguna es una falla de la VM. El costo es de código, no de tiempo de ejecución: una llamada a través de una interfaz es tan grande como la suma de los métodos de todas las instancias que pueden responderla, de modo que una interfaz implementada por bloques con muchas instancias conviene llamarla desde un bloque de función y no desde muchos lugares.

## Proyectos, archivos y memoria

- **Una sola unidad.** Todos los archivos de texto estructurado de un proyecto (`src/*.st`) se compilan como una sola unidad. Un tipo, una función, un bloque de función, una interfaz o una `VAR_GLOBAL` declarados en cualquier archivo son visibles para todos los programas, y el archivo que usa un tipo puede ir antes que el que lo declara (`cmp-042-function-block-in-another-file`). Un `PROGRAM` que ninguna tarea ejecuta no se compila. Los lenguajes gráficos y la lista de instrucciones se compilan cuando una tarea los ejecuta.
- **Una global es una sola variable.** Tiene una dirección, compartida por todos los programas y todas las tareas, y un valor inicial que se aplica una vez, antes del primer ciclo de la tarea que se ejecute primero. Dos programas pueden declarar variables con el mismo nombre: cada uno conserva la suya.
- **Una declaración hecha dos veces es un error en ambos lugares**, y el mensaje nombra ambos archivos y líneas (`cmp-042-function-block-declared-in-two-files-is-rejected`).
- **Una sola memoria.** Las globales, las funciones, las instancias de bloques de función, los programas, los literales de cadena y los búferes de trabajo de las funciones de cadena comparten la memoria WORK del perfil del destino: 8192 bytes en el destino `posix`. No hay un límite por programa ni por tarea, y el último byte es el indicador de inicialización.
- **Disposición.** El compilador coloca, en este orden: las globales, las variables de cada función, las variables de los métodos, las variables de cada programa en el orden de las tareas, los literales de cadena y los búferes de trabajo. Cada variable se alinea a su tamaño hasta 4 bytes, de modo que el mismo proyecto da siempre las mismas direcciones. El mapa de depuración lista cada dirección (vea el [modelo de memoria](../runtime/memory-model.md)).
- **Una falla de asignación nombra lo que necesita.** Un proyecto que no cabe es un error de compilación en la declaración que cruza el final de la región. Indica los bytes necesarios, los bytes disponibles y los tres mayores consumidores: `WORK allocation exceeds the target memory profile: 9005 bytes required, 8192 bytes available (...). Largest consumers: Overflow.Table (9000 bytes), Overflow.Gain (4 bytes)`. Una placa con una memoria WORK menor tiene un límite menor, porque el proyecto se compila contra el perfil de la placa que nombra.
- **Dónde se encuentra una global.** El mapa de depuración lista una global una sola vez, en la unidad del archivo que la declara, marcada `scope: "global"`. Una señal de escenario la nombra como `Program.Global` o solo por su nombre, y una observación toma el nombre de la global y muestra esa dirección.

## Límites conocidos

Esta sección lista lo que el compilador, el cargador y el mapa de depuración no hacen como pide IEC 61131-3. La tabla se genera a partir de los casos de conformidad que se espera que fallen (`tools/ci/expected-failures.json`) y de la descripción de cada requisito en `docs/known-limits.json`: una fila existe mientras falle al menos un caso de su requisito, y desaparece cuando pasa el último. Los bloques y funciones estándar tienen su propia tabla en la [sección 11 de la referencia de la biblioteca estándar](../runtime/stdlib.md#11-diferencias-conocidas-con-iec-61131-3).

{/* >>> GENERATED (tools/docs/generate_known_limits.py): known-limits-language. Do not edit. >>> */}
Ningún caso de conformidad de esta área figura en la lista de fallas esperadas: no hay un límite registrado.
{/* <<< END GENERATED: known-limits-language <<< */}

No se admiten en esta versión y se rechazan con un mensaje, por la decisión D-04: arreglos de arreglos, enumeraciones con tipo base, subrangos, `POINTER TO` y `ADR` (use `REF_TO` y `REF()`), `VAR_ACCESS`, una `CONFIGURATION` textual, `NAMESPACE`, `PROPERTY`, bloques `ACTION` en un programa, llamadas posicionales a bloques de función y las formas de función de los operadores, como `ADD(a, b)`. Los casos `cmp-006-*-is-rejected` fijan el rechazo, de modo que un programa que usa alguno no se compila.
