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
- Los enteros, las cadenas de bits y `REAL` forman una familia. Un tipo entero, `BYTE`, `WORD` y `DWORD` se convierten entre sí, y un valor que no cabe en el destino conserva sus bits bajos. Un entero se convierte a `REAL` y a `LREAL`, y `REAL` a `LREAL`. Un `REAL` no se convierte a un entero: escriba `REAL_TO_INT(x)`.
- `BOOL` no se convierte a ni desde nada más, y tampoco `TIME`, `DATE`, `TOD` y `DT`: `i := b;`, `b := 1;` y `n := t;` son errores de compilación. La diferencia de dos valores `DT`, `TOD` o `DATE` es un `TIME`.
- La condición de `IF`, `ELSIF`, `WHILE` y `UNTIL` es un `BOOL`: escriba `IF count <> 0 THEN`, no `IF count THEN`. La aritmética no toma un `BOOL`, `MOD` toma enteros, y `AND`, `OR`, `XOR` y `NOT` toman `BOOL` o cadenas de bits, no `REAL`; un `BOOL` no se compara con un número.
- Una expresión constante (literales, constantes con nombre, `+ - * /` y `MOD` de ellos) debe caber en el tipo al que va: `small : SINT := 300;`, `level := -1;` para un `USINT` y `doubled := limit * 2;` con una constante `limit` de 20000 son errores de compilación. Una variable se controla por su tipo, no por su valor.
- Un literal mayor que 2147483647 es un valor de 32 bits sin signo: va a una variable `UDINT` o `DWORD`, a un parámetro `UDINT` y a `AND_DWORD`, `OR_DWORD`, `XOR_DWORD` y `NOT_DWORD`; un literal fuera del rango de un parámetro `WORD` es un error.

## Funciones y bloques de función

Cada regla de abajo está cubierta por un caso de conformidad en `conformance/cmp` (CMP-034, CMP-035, CMP-037).

- Cada función es un ámbito propio: dos funciones pueden declarar parámetros y locales con los mismos nombres, y un parámetro puede llamarse como una variable de un programa. Dentro de una función, un nombre es primero una variable propia y luego una `VAR_GLOBAL` (las variables de un programa no se ven allí). El nombre de la función es su variable de resultado.
- Una función se llama con los argumentos por posición, `Sub(10, 2)`, o por nombre en cualquier orden, `Sub(b := 2, a := 10)`. Los argumentos posicionales van primero. Un parámetro dado dos veces, un nombre que la función no tiene, un argumento de más y un parámetro obligatorio sin argumento son errores de compilación; un parámetro que declara un valor inicial (`factor : INT := 10;`) puede omitirse y vale ese valor.
- Una llamada puede ser una sentencia: `Bump(by := 2);` ejecuta la función y descarta su resultado. Una función puede declararse antes o después de las que la llaman, y ninguna puede llamarse a sí misma, directamente o a través de otras: es un error de compilación en la llamada que cierra el ciclo.
- Un bloque de función se llama con parámetros con nombre. `IN := x` da una entrada y `Q => y` copia la salida `Q` en la variable `y` después de la llamada (`y` puede ser un miembro o un elemento). Los nombres se comparan sin distinguir mayúsculas de minúsculas. Un nombre que el bloque no tiene, una local del bloque, una salida con valor dado con `:=` y una entrada enlazada con `=>` son errores de compilación. La llamada posicional de un bloque de función queda para 2.x.

## Entrada a la biblioteca estándar

Ver [Biblioteca Estándar](./stdlib.md).
