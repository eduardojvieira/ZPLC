---
description: Cree peldaños en el editor de escalera de ZPLC, use las cajas de función con EN y ENO y evite los errores más comunes.
tags: [languages, ladder, ld]
---

# Escribir un diagrama de escalera

Esta guía muestra cómo crear un programa en diagrama de escalera en el editor de ZPLC: cómo se arma un peldaño, qué elementos ofrece la paleta, cómo se comportan las cajas de función con EN y ENO y qué errores rechaza la compilación. La lista completa de elementos, con la prueba de cada uno, está en la [referencia generada del diagrama de escalera](../reference/language-ld.md).

Un archivo de escalera es un modelo de peldaños, no texto. La compilación lo valida y lo traduce a texto estructurado, que es una salida de solo lectura; después el compilador lo trata como cualquier otro programa ([Flujo del compilador](../ide/compiler.md)).

## Armar un peldaño

1. Abra un archivo de escalera del proyecto, o cree uno con **Nuevo archivo**. Un proyecto nuevo también puede empezar con un programa en escalera.
2. Declare las variables que usa el peldaño en la tabla de variables del archivo, con su tipo y, para una entrada o salida física, su dirección (`%IX0.0`, `%QX0.0`; vea la [tabla de direcciones](../reference/language-ld.md#direccionamiento-de-es)).
3. Elija **Agregar peldaño**. El cursor es un marco azul sobre una celda del peldaño.
4. Ponga un contacto a la izquierda y una bobina a la derecha. Pulse un elemento de la caja de herramientas para insertarlo en el cursor, arrástrelo a la cuadrícula o use las teclas: `C` inserta un contacto, `N` un contacto invertido y `O` una bobina; `Insert` o `I` abre la paleta como una lista de búsqueda.
5. Pulse `F2` sobre un elemento para asociarle una variable de los símbolos declarados. Un contacto o una bobina soltados desde la caja de herramientas muestran `???` hasta que se asocian.
6. Use **Agregar una rama paralela** para dar al peldaño un segundo camino, y **Subir el peldaño**, **Bajar el peldaño** y **Eliminar el peldaño** para ordenar los peldaños.
7. Compile el proyecto (`Ctrl+B`) y lea la pestaña Problemas. Un problema nombra el peldaño y la celda a los que se refiere, y al activarlo se selecciona ese elemento.

Cada acción también se puede hacer con el teclado; la [referencia de teclado](../reference/visual-editor-keyboard.md) lista las teclas.

## Los elementos de la paleta

| Grupo              | Elementos                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contactos          | normalmente abierto, normalmente cerrado, flanco ascendente, flanco descendente                                                                                   |
| Bobinas            | normal, negada, de activación, de desactivación, flanco ascendente, flanco descendente                                                                            |
| Estructura         | la rama paralela                                                                                                                                                  |
| Bloques de función | los temporizadores, contadores, disparadores y biestables de la biblioteca, y los bloques de función que declaran los archivos de texto estructurado del proyecto |
| Funciones          | las quince funciones IEC que se ejecutan como cajas con EN y ENO, descritas más abajo                                                                             |

Los bloques de comunicación `COMM_CONNECT`, `COMM_PUBLISH`, `COMM_SUBSCRIBE` y `COMM_MODBUS` no se ofrecen: un archivo de escalera no puede declarar una instancia de ellos. Una función del proyecto no se coloca en un peldaño; llámela desde un diagrama de bloques de función o desde texto estructurado. Los saltos y las etiquetas no se admiten, y la compilación los rechaza con un mensaje.

## Cómo fluye la energía

Lea un peldaño desde el riel izquierdo hacia el derecho. Los contactos en serie son un AND, los contactos en ramas paralelas son un OR, y una bobina toma la energía que llega a su propia posición. Lo que se coloque después de un bloque de función sigue la salida de ese bloque.

El peldaño siguiente tiene un contacto, una caja de comparación, una caja de suma y una bobina. La compilación lo traduce al texto estructurado de abajo, que esta página completa con declaraciones para que la integración continua pueda ejecutarlo con `Start` activo y `Level` en 110:

```st runnable expect="Lamp=TRUE Sum=113" scans=1 scan_ms=10
PROGRAM Rungs
VAR
    Start : BOOL := TRUE;
    Level : INT := 110;
    Lamp : BOOL;
    Sum : INT;
    _rung1_result : BOOL;
    _rung1_result_2 : BOOL;
END_VAR
_rung1_result := Level > 100;
_rung1_result_2 := Start AND _rung1_result;
IF _rung1_result_2 THEN Sum := Level + 3; END_IF;
Lamp := _rung1_result_2;
END_PROGRAM
```

## Cajas de función con EN y ENO

Una caja de función se coloca en el peldaño como un contacto. Su cable izquierdo es EN, la energía que llega a ella, y su cable derecho es ENO, la energía que sale de ella. Elija la caja en el grupo **Funciones** de la paleta; el número de operandos sigue a la función elegida, y el campo Función del elemento la cambia después.

- La **comparación** (`GT`, `GE`, `EQ`, `NE`, `LE`, `LT`) es una condición en serie. La energía pasa por ella cuando la energía que llega está activa y la comparación se cumple. No tiene salida.
- Las **operaciones matemáticas** (`ADD`, `SUB`, `MUL`, `DIV`, `MOD`), la **copia** (`MOVE`) y la **selección** (`LIMIT`, `MIN`, `MAX`) se ejecutan mientras EN está activo. Escriben el resultado en su variable de salida y dejan pasar la energía. Mientras EN está inactivo no se ejecutan, su salida conserva el valor y ENO está inactivo.
- Cada operando es una variable declarada o un literal que usted escribe. La salida es una variable declarada que no es una entrada.
- La caja no detecta ningún error, por eso ENO nunca informa de uno. Un resultado entero que no cabe en su tipo se desborda y da la vuelta.
- `DIV` y `MOD` con divisor cero ponen la VM en falla: el ciclo termina en falla, la salida no se escribe y la imagen de salidas `%Q` se borra, así que una salida asignada lee 0. Lo mismo vale para `REAL` con `0.0` o `-0.0`. Proteja el divisor con una caja de comparación en serie.

Los pines de operandos son `IN1` e `IN2` para las comparaciones, las operaciones matemáticas, `MIN` y `MAX`; `IN` para `MOVE`; y `MN`, `IN` y `MX` para `LIMIT`.

## Quién puede escribir una variable

| Escritores de una variable                                            | Resultado                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Varias cajas de función                                               | Se permite. Cada una escribe mientras su EN está activo, y gana la última en el orden del ciclo. |
| Una bobina                                                            | Se permite.                                                                                      |
| Una bobina de activación en un peldaño y una de desactivación en otro | Se permite.                                                                                      |
| Dos bobinas normales                                                  | Se rechaza: `Multiple writers target ...`.                                                       |
| Una bobina y una caja de función                                      | Se rechaza, y el mensaje nombra ambas posiciones.                                                |

## Errores comunes

| Error                                           | Qué ocurre                                                   | Qué hacer                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Dos bobinas gobiernan la misma salida           | La compilación lo rechaza con `Multiple writers target ...`. | Combine las condiciones en un peldaño, o use una bobina de activación y una de desactivación en dos peldaños. |
| Una caja y una bobina escriben una variable     | La compilación lo rechaza y nombra ambos elementos.          | Dé a la caja su propia variable de salida y léala con un contacto.                                            |
| `DIV` o `MOD` con un divisor que puede ser cero | La VM entra en falla y las salidas se borran.                | Ponga en serie, antes de la caja, un `NE` con el divisor y 0.                                                 |
| Una caja con un operando o una salida vacíos    | La compilación informa de la caja por peldaño y celda.       | Pulse `F2` sobre la caja y asocie cada ranura.                                                                |
| Un contacto o una bobina siguen mostrando `???` | No están asociados a una variable.                           | Pulse `F2` y elija un símbolo declarado.                                                                      |
| Un salto o una etiqueta                         | La compilación lo rechaza con un mensaje.                    | Use una rama, o mueva la lógica a un programa de texto estructurado.                                          |

## Verla en ejecución

Mientras un programa se ejecuta en la simulación, un elemento se ilumina cuando le llega energía, y una caja muestra el valor de cada operando que es una variable, de su salida, y de EN y ENO. Un valor que no se leyó se muestra como no disponible, nunca como FALSE. Vea [Editores de texto y visuales](../ide/editors.md#valores-en-línea-desde-el-mapa-de-depuración) para saber qué muestra cada editor, y [El entorno de trabajo de ZPLC](../ide/features.md#pausa-reanudación-paso-y-stop) para pausar y avanzar paso a paso.

Nivel de evidencia: host. `packages/zplc-ide/src/transpiler/ldFunctions.test.ts` comprueba las instrucciones de cada caja, las reglas de escritura y los rechazos, y los casos de conformidad de la referencia ejecutan las cajas en el runtime nativo. No se usó ninguna placa.
